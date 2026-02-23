---
phase: quick-290
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/items.ts
  - spacetimedb/src/reducers/items_crafting.ts
  - spacetimedb/src/reducers/items_gathering.ts
  - spacetimedb/src/reducers/items_trading.ts
  - spacetimedb/src/reducers/index.ts
autonomous: true
requirements: [REORG-01]

must_haves:
  truths:
    - "Module publishes successfully with zero behavior changes"
    - "All reducers still register and function identically"
    - "No circular imports between new files"
  artifacts:
    - path: "spacetimedb/src/reducers/items_crafting.ts"
      provides: "Crafting reducers: research_recipes, craft_recipe, learn_recipe_scroll, salvage_item"
      exports: ["registerItemCraftingReducers"]
    - path: "spacetimedb/src/reducers/items_gathering.ts"
      provides: "Gathering reducers: start_gather_resource, finish_gather"
      exports: ["registerItemGatheringReducers"]
    - path: "spacetimedb/src/reducers/items_trading.ts"
      provides: "Trading reducers: start_trade, add_trade_item, remove_trade_item, offer_trade, cancel_trade"
      exports: ["registerItemTradingReducers"]
    - path: "spacetimedb/src/reducers/items.ts"
      provides: "Core item reducers: buy/sell, equip/unequip, loot, hotbar, abilities, use_item, sync, stack management"
    - path: "spacetimedb/src/reducers/index.ts"
      provides: "Updated reducer registration importing all 4 item reducer files"
  key_links:
    - from: "spacetimedb/src/reducers/index.ts"
      to: "All 4 item reducer files"
      via: "registerXxxReducers(deps) calls"
      pattern: "register(ItemCrafting|ItemGathering|ItemTrading|Item)Reducers"
---

<objective>
Split reducers/items.ts (1956 lines) into 4 cohesive files by extracting crafting, gathering, and trading concerns.

Purpose: The file mixes 5+ distinct domains (inventory, crafting, gathering, trading, consumables, sync, salvage). Following the same pattern used to split helpers/combat.ts (quick-288), extract the 3 most self-contained domains into their own files, leaving core inventory management in the original.

Output: 4 reducer files replacing 1 monolith, same public API, zero behavior change.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/reducers/items.ts
@spacetimedb/src/reducers/index.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extract crafting, gathering, and trading reducers into separate files</name>
  <files>
    spacetimedb/src/reducers/items_crafting.ts
    spacetimedb/src/reducers/items_gathering.ts
    spacetimedb/src/reducers/items_trading.ts
    spacetimedb/src/reducers/items.ts
  </files>
  <action>
Split reducers/items.ts into 4 files following the exact same pattern (deps injection, exported register function):

**items_crafting.ts** (~450 lines) - `export const registerItemCraftingReducers = (deps: any) => { ... }`
Extract these reducers and their local helpers:
- `statKeyToAffix` helper function (line ~1126)
- `research_recipes` reducer (line ~1060)
- `craft_recipe` reducer (line ~1141)
- `learn_recipe_scroll` reducer (line ~1343)
- `salvage_item` reducer (line ~1865)
Imports needed: `buildDisplayName`, `findItemTemplateByName` from helpers/items, crafting_materials imports, combat_scaling imports

**items_gathering.ts** (~200 lines) - `export const registerItemGatheringReducers = (deps: any) => { ... }`
Extract these reducers and their local constants:
- `RESOURCE_GATHER_CAST_MICROS`, `RESOURCE_GATHER_MIN_QTY`, `RESOURCE_GATHER_MAX_QTY` constants (line ~886)
- `GATHER_AGGRO_BASE_CHANCE`, `GATHER_AGGRO_PER_DANGER_STEP`, `GATHER_AGGRO_MAX_CHANCE` constants (line ~61)
- `start_gather_resource` reducer (line ~890)
- `finish_gather` reducer (line ~986)
Imports needed: `getPerkBonusByField` from helpers/renown, `CRAFTING_MODIFIER_DEFS` from data/crafting_materials

**items_trading.ts** (~300 lines) - `export const registerItemTradingReducers = (deps: any) => { ... }`
Extract these reducers and their local helpers:
- `findActiveTrade` helper (line ~1553)
- `inventoryHasSpaceForItems` helper (line ~1563)
- `finalizeTrade` helper (line ~1589)
- `start_trade` reducer (line ~1691)
- `add_trade_item` reducer (line ~1732)
- `remove_trade_item` reducer (line ~1759)
- `offer_trade` reducer (line ~1776)
- `cancel_trade` reducer (line ~1791)

**items.ts** (remaining ~900 lines) - Keep `registerItemReducers` with:
- `failItem` helper
- `create_item_template`, `grant_item`, `buy_item`, `sell_item`, `sell_all_junk`
- `take_loot`, `take_all_loot`
- `equip_item`, `unequip_item`, `delete_item`, `split_stack`, `consolidate_stacks`
- `set_hotbar_slot`, `use_ability`
- `CONSUMABLE_COOLDOWN_MICROS`, `BANDAGE_TICK_COUNT`, `BANDAGE_TICK_HEAL` constants
- `use_item` reducer
- All `sync_*` reducers (sync_equipment_tables through sync_all_content)

Each new file must:
1. Import only what it needs from data/ and helpers/ (copy relevant import lines from items.ts)
2. Destructure only the deps it actually uses from the deps object
3. Use the same `failItem` pattern: `const failItem = (ctx: any, character: any, message: string) => fail(ctx, character, message, 'system');`
4. NOT import from other reducer files (no circular deps)

Remove the extracted code from items.ts. Remove any imports from items.ts that are no longer used after extraction.
  </action>
  <verify>
Confirm no TypeScript syntax errors by checking the file structure is valid (matching braces, proper exports). Each file should export exactly one registerXxxReducers function. Verify items.ts no longer contains any of the extracted reducer names (research_recipes, craft_recipe, learn_recipe_scroll, salvage_item, start_gather_resource, finish_gather, start_trade, add_trade_item, remove_trade_item, offer_trade, cancel_trade).
  </verify>
  <done>4 files exist, each exporting a registerXxxReducers function. No reducer logic duplicated. All imports resolve to existing modules.</done>
</task>

<task type="auto">
  <name>Task 2: Update reducer index to register all 4 item reducer files</name>
  <files>
    spacetimedb/src/reducers/index.ts
  </files>
  <action>
Update reducers/index.ts to import and call all 4 item reducer registration functions:

1. Add imports:
   ```
   import { registerItemCraftingReducers } from './items_crafting';
   import { registerItemGatheringReducers } from './items_gathering';
   import { registerItemTradingReducers } from './items_trading';
   ```
2. Add calls in registerReducers body (after registerItemReducers):
   ```
   registerItemCraftingReducers(deps);
   registerItemGatheringReducers(deps);
   registerItemTradingReducers(deps);
   ```
3. Keep the existing `registerItemReducers(deps)` call unchanged.
  </action>
  <verify>
Run `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` to verify the module compiles and publishes successfully. All reducers must be registered. Check spacetime logs for any registration errors.
  </verify>
  <done>Module publishes to local SpacetimeDB without errors. All item-related reducers (buy, sell, equip, craft, gather, trade, salvage, sync) are registered and callable.</done>
</task>

</tasks>

<verification>
- `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` succeeds
- `spacetime logs uwr` shows no errors on startup
- Line counts: items.ts < 1000, items_crafting.ts ~450, items_gathering.ts ~200, items_trading.ts ~300
- No reducer name appears in more than one file (no duplication)
- grep for `registerItem.*Reducers` in index.ts shows all 4 registrations
</verification>

<success_criteria>
- reducers/items.ts reduced from 1956 to ~900 lines
- 3 new files created with cohesive, single-concern reducer groups
- Module publishes and all reducers function identically
- Zero behavior changes (pure refactor)
</success_criteria>

<output>
After completion, create `.planning/quick/290-review-and-reorganize-large-files-in-spa/290-SUMMARY.md`
</output>
