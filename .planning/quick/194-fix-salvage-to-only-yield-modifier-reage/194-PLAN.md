---
phase: quick-194
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/items.ts
autonomous: true
requirements:
  - FIX-194
must_haves:
  truths:
    - "Salvaging an item with armorClassBonus affix only ever yields Iron Ward (armorClassBonus reagent)"
    - "Salvaging a common item (no ItemAffix rows) yields no bonus reagent"
    - "Salvaging an item with hpBonus + strBonus affixes can only yield Life Stone or Glowing Stone"
  artifacts:
    - path: "spacetimedb/src/reducers/items.ts"
      provides: "salvage_item reducer with affix-constrained reagent drop"
      contains: "affixStatKeys"
  key_links:
    - from: "salvage_item reducer"
      to: "ctx.db.itemAffix.by_instance.filter(instance.id)"
      via: "collect statKey set from item's actual affixes"
      pattern: "affixStatKeys"
    - from: "filteredModDefs"
      to: "CRAFTING_MODIFIER_DEFS"
      via: "filter by statKey in affixStatKeys set"
      pattern: "filteredModDefs"
---

<objective>
Fix the salvage_item reducer so bonus modifier reagent drops are constrained to reagents whose statKey matches one of the salvaged item's actual ItemAffix statKeys.

Purpose: Salvaging an armor piece with armorClassBonus should yield Iron Ward — not a random reagent like Life Stone (hpBonus). Reagent drops must reflect the item's actual modifier composition.

Output: Updated salvage_item reducer in spacetimedb/src/reducers/items.ts.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/data/crafting_materials.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Constrain salvage reagent drop to item's actual affix statKeys</name>
  <files>spacetimedb/src/reducers/items.ts</files>
  <action>
In the `salvage_item` reducer, locate the "Bonus modifier reagent yield (12% chance)" block (currently lines 1805-1816).

Replace the current logic with an affix-constrained version:

1. Before the roll, collect the unique set of `statKey` values from the item's `ItemAffix` rows:
   ```typescript
   const affixStatKeys = new Set(
     [...ctx.db.itemAffix.by_instance.filter(instance.id)].map(a => a.statKey)
   );
   ```
   Note: The `by_instance` filter is already called later in the reducer to delete affixes. At this point the affixes still exist (deletion happens after this block), so reading them here is safe.

2. Build a filtered list of modifier defs whose `statKey` is in that set:
   ```typescript
   const filteredModDefs = CRAFTING_MODIFIER_DEFS.filter(d => affixStatKeys.has(d.statKey));
   ```

3. Guard: if `filteredModDefs` is empty (item has no affixes or no matching modifier defs), skip the reagent drop entirely — do not fall back to the full pool.

4. Only roll the 12% chance and pick from `filteredModDefs` when `filteredModDefs.length > 0`:
   ```typescript
   if (filteredModDefs.length > 0) {
     const modifierRoll = (ctx.timestamp.microsSinceUnixEpoch + args.itemInstanceId * 13n) % 100n;
     if (modifierRoll < 12n) {
       const modIdx = Number((args.itemInstanceId + character.id) % BigInt(filteredModDefs.length));
       const modDef = filteredModDefs[modIdx];
       const modifierTemplate = findItemTemplateByName(ctx, modDef.name);
       if (modifierTemplate) {
         addItemToInventory(ctx, character.id, modifierTemplate.id, 1n);
         appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward',
           `You also found 1x ${modDef.name} while salvaging.`);
       }
     }
   }
   ```

Replace the entire existing bonus reagent block with this new version. Do not change any other part of the reducer.

The `CRAFTING_MODIFIER_DEFS` import is already present in the import on line 4.
  </action>
  <verify>
    TypeScript compiles: run `spacetime publish uwr --project-path spacetimedb` and confirm no build errors.

    Logic check: Search the updated file for `affixStatKeys` — it must appear in the salvage_item reducer. Search for `CRAFTING_MODIFIER_DEFS.length` — it must NOT appear in the salvage block (old code used the full array length as modulus).
  </verify>
  <done>
    - `affixStatKeys` is built from `ctx.db.itemAffix.by_instance.filter(instance.id)` before the roll
    - `filteredModDefs` filters `CRAFTING_MODIFIER_DEFS` by `affixStatKeys`
    - Roll and pick only happen when `filteredModDefs.length > 0`
    - `modIdx` uses `% BigInt(filteredModDefs.length)` not `% BigInt(CRAFTING_MODIFIER_DEFS.length)`
    - Module publishes successfully
  </done>
</task>

</tasks>

<verification>
After publish:
- Salvage a common item (no affixes) — no reagent drop message should appear
- Salvage an item with an armorClassBonus affix — if a reagent drops, it must be Iron Ward (armorClassBonus statKey)
- Salvage an item with an hpBonus affix — if a reagent drops, it must be Life Stone (hpBonus statKey)
</verification>

<success_criteria>
Reagent drops from salvage are always thematically tied to the item's actual modifier composition. Common items (no affixes) never drop reagents. Items with N distinct affix statKeys can only drop from the N matching reagents in CRAFTING_MODIFIER_DEFS.
</success_criteria>

<output>
After completion, create `.planning/quick/194-fix-salvage-to-only-yield-modifier-reage/194-SUMMARY.md`
</output>
