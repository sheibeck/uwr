---
phase: quick-60
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/index.ts
autonomous: true

must_haves:
  truths:
    - "Druid Nature's Mark ability gathers 1-4 resources into inventory when used out of combat"
    - "Player sees a log message naming the gathered resource and quantity"
    - "Ability correctly deducts mana and triggers 120s cooldown"
  artifacts:
    - path: "spacetimedb/src/index.ts"
      provides: "Fixed druid_natures_mark ability handler"
      contains: "case 'druid_natures_mark'"
  key_links:
    - from: "druid_natures_mark handler"
      to: "addItemToInventory"
      via: "direct function call after pool selection"
      pattern: "addItemToInventory.*character\\.id.*template\\.id"
---

<objective>
Fix druid Nature's Mark (level 2) ability so it actually gathers resources when used out of combat.

Purpose: User reports Nature's Mark doesn't work - no resources gathered. Code review shows the handler at ~line 2935 in index.ts appears logically correct (calls getGatherableResourceTemplates, picks random entry, calls addItemToInventory), but something prevents actual resource gathering at runtime.

Output: Working druid_natures_mark that gathers 1-4 terrain-appropriate resources into inventory with log message confirmation.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Key files:
@spacetimedb/src/index.ts (druid_natures_mark handler ~line 2935, getGatherableResourceTemplates ~line 3629, addItemToInventory ~line 3559, executeAbility ~line 1887)
@spacetimedb/src/reducers/items.ts (use_ability reducer ~line 428, try/catch at ~line 519 that catches SenderError and logs "Ability failed:")
@spacetimedb/src/data/ability_catalog.ts (druid_natures_mark entry ~line 710: level 2n, power 2n, mana, cooldown 120s, castSeconds 0n)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Debug and fix Nature's Mark resource gathering</name>
  <files>spacetimedb/src/index.ts</files>
  <action>
The druid_natures_mark handler at ~line 2935 in index.ts appears logically correct but users report no resources are gathered. The code calls getGatherableResourceTemplates, picks a random entry, checks hasInventorySpace, and calls addItemToInventory.

**Investigation approach:**

1. First check the handler for the most likely failure mode: the `getGatherableResourceTemplates` function at ~line 3629 resolves pool entries by calling `findItemTemplateByName(ctx, entry.name)` for each resource name. If ANY of these return null (name mismatch with actual database data), those entries are filtered out. If ALL return null, the pool is empty and the ability says "Nature yields nothing here."

   Cross-reference: the pool names in getGatherableResourceTemplates (e.g., 'Copper Ore', 'Stone', 'Flax', 'Herbs', etc.) with the names in ensureResourceItemTemplates (~line 3908). Verify every name in the terrain pools exists in the resource templates list. Fix any mismatches.

2. Check if the `seed` calculation at line 2952 could cause an out-of-bounds array access. The seed is `ctx.timestamp.microsSinceUnixEpoch + character.id`, and the index is `Number(seed % BigInt(pool.length))`. Verify this produces valid indices.

3. Check if `hasInventorySpace` at line 2966 could incorrectly return false. It checks if the item is stackable and if an existing stack exists, or if there's room for a new slot (< 20 slots). Resource items are stackable (ensureResourceItemTemplates sets stackable: true), so if the character already has that resource, hasInventorySpace should return true.

4. Check if the `try/catch` block in the use_ability reducer (items.ts ~line 519-575) could be swallowing a runtime error thrown during Nature's Mark execution. If any non-SenderError exception occurs (e.g., TypeError from null access), it would be caught and logged as "Ability failed: ..." — the user might see this message but not understand it means "no resources gathered."

**Most likely fix needed:**

The handler's `return` at line 2984 returns from `executeAbility`, which means execution falls through to the use_ability reducer's success path where it logs the generic `"You use druid natures mark on yourself."` message AND sets the cooldown. So mana is deducted, cooldown is set, and the generic message appears — but if the resource gathering silently fails (e.g., template lookup issue), the user sees the generic message and cooldown but no resources.

**Action items:**

A) Add a guard re-read of the character from database inside the handler to ensure fresh data:
   ```
   const freshChar = ctx.db.character.id.find(character.id);
   if (!freshChar) return;
   ```
   Use `freshChar.locationId` instead of `character.locationId` when looking up the location. The `character` variable may have stale locationId if a prior operation (mana deduction at line 1940) somehow affected the row lookup.

B) Add diagnostic appendPrivateEvent calls at key decision points in the handler to trace the exact code path:
   - After pool generation: log pool size
   - After pick: log picked template name
   - After hasInventorySpace: log result
   These diagnostic events help the user see exactly what's happening. Use kind='ability' so they show in the log.

C) Check that the `getGatherableResourceTemplates` return type works correctly. The function's `.filter(Boolean)` cast at line 3695 uses `as { template: ...; weight: bigint }[]` which drops the `timeOfDay` field from the type — but the `timeOfDay` property still exists on the object at runtime. This is fine for Nature's Mark since it only accesses `.template`.

D) After fixing, verify the handler works end-to-end by examining the code path. Remove or reduce diagnostic events to just one confirmation message (keep the success message "Nature's Mark yields X Item." and remove verbose tracing once the fix is confirmed).

**Important:** The handler MUST NOT throw SenderError for expected cases (empty pool, full inventory). It should log a message and return gracefully, which it already does. Only throw for truly unexpected errors.

**Important:** Do NOT change the executeAbility function signature or the use_ability reducer structure. Only modify the druid_natures_mark case handler and potentially getGatherableResourceTemplates if a bug is found there.
  </action>
  <verify>
    1. Read the modified code to confirm the fix is in place
    2. Run `cd C:\projects\uwr\spacetimedb && npm run build` to verify compilation
    3. Publish the module: `spacetime publish uwr --project-path C:\projects\uwr\spacetimedb`
    4. Check server logs: `spacetime logs uwr` for any errors related to druid_natures_mark
  </verify>
  <done>
    - druid_natures_mark case handler gathers resources from the terrain pool into inventory
    - Success message "Nature's Mark yields N ResourceName." appears in player log
    - Module compiles and publishes without errors
    - No SenderError or runtime errors when ability is used out of combat
  </done>
</task>

</tasks>

<verification>
- Module compiles: `cd spacetimedb && npm run build` succeeds
- Module publishes: `spacetime publish uwr --project-path spacetimedb` succeeds
- No regression: other abilities (druid_thorn_lash, resource gathering) still work
- Server logs show no errors for druid_natures_mark usage
</verification>

<success_criteria>
- Nature's Mark gathers 1-4 terrain-appropriate resources into druid's inventory when used out of combat
- Player sees log message confirming what was gathered
- Mana is deducted and 120s cooldown is applied
- No errors in server logs
</success_criteria>

<output>
After completion, create `.planning/quick/60-fix-druid-nature-s-mark-level-2-ability-/60-SUMMARY.md`
</output>
