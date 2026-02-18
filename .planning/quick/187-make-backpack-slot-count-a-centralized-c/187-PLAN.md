---
phase: quick-187
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/items.ts
  - spacetimedb/src/reducers/items.ts
  - spacetimedb/src/reducers/commands.ts
  - spacetimedb/src/index.ts
  - src/composables/useInventory.ts
autonomous: true
must_haves:
  truths:
    - "All backpack capacity checks reference MAX_INVENTORY_SLOTS constant, no hardcoded 20"
    - "MAX_INVENTORY_SLOTS is set to 50"
    - "Client UI shows X / 50 for backpack slot count"
  artifacts:
    - path: "spacetimedb/src/helpers/items.ts"
      provides: "MAX_INVENTORY_SLOTS = 50 constant"
      contains: "MAX_INVENTORY_SLOTS = 50"
    - path: "spacetimedb/src/reducers/items.ts"
      provides: "All capacity checks use MAX_INVENTORY_SLOTS"
    - path: "spacetimedb/src/reducers/commands.ts"
      provides: "All capacity checks use MAX_INVENTORY_SLOTS"
    - path: "src/composables/useInventory.ts"
      provides: "maxInventorySlots uses shared constant or 50"
  key_links:
    - from: "spacetimedb/src/reducers/items.ts"
      to: "spacetimedb/src/helpers/items.ts"
      via: "MAX_INVENTORY_SLOTS import through deps"
      pattern: "MAX_INVENTORY_SLOTS"
    - from: "spacetimedb/src/reducers/commands.ts"
      to: "spacetimedb/src/helpers/items.ts"
      via: "MAX_INVENTORY_SLOTS import through deps"
      pattern: "MAX_INVENTORY_SLOTS"
---

<objective>
Centralize backpack slot capacity into a single MAX_INVENTORY_SLOTS constant and bump from 20 to 50.

Purpose: Eliminate magic number "20" scattered across 7+ locations in server reducers and client composable. Make future capacity changes a one-line edit.
Output: All backpack capacity checks reference MAX_INVENTORY_SLOTS (set to 50), no hardcoded 20 for inventory capacity anywhere.
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
  <name>Task 1: Centralize and export MAX_INVENTORY_SLOTS, replace all server hardcoded 20s</name>
  <files>
    spacetimedb/src/helpers/items.ts
    spacetimedb/src/index.ts
    spacetimedb/src/reducers/items.ts
    spacetimedb/src/reducers/commands.ts
  </files>
  <action>
1. In `spacetimedb/src/helpers/items.ts` line 330, change `MAX_INVENTORY_SLOTS = 20` to `MAX_INVENTORY_SLOTS = 50`.

2. In `spacetimedb/src/index.ts`, add `MAX_INVENTORY_SLOTS` to the import from `./helpers/items` (around line 95-107) and add it to the deps object that is passed to reducers (around line 430-445 area where getInventorySlotCount etc. are listed).

3. In `spacetimedb/src/reducers/items.ts`:
   - Destructure `MAX_INVENTORY_SLOTS` from deps (in the same block where `getInventorySlotCount` is destructured, around line 35).
   - Replace ALL 5 hardcoded `20` capacity checks with `MAX_INVENTORY_SLOTS`:
     - Line 152: `itemCount >= 20` -> `itemCount >= MAX_INVENTORY_SLOTS` (buy_item)
     - Line 281: `itemCount >= 20` -> `itemCount >= MAX_INVENTORY_SLOTS` (take_loot)
     - Line 360: `itemCount >= 20` -> `itemCount >= MAX_INVENTORY_SLOTS` (take_all_loot loop)
     - Line 515: `getInventorySlotCount(ctx, character.id) >= 20` -> `getInventorySlotCount(ctx, character.id) >= MAX_INVENTORY_SLOTS` (split_stack)
     - Line 1489: `... + requiredSlots <= 20` -> `... + requiredSlots <= MAX_INVENTORY_SLOTS` (trade space check)

4. In `spacetimedb/src/reducers/commands.ts`:
   - Add `MAX_INVENTORY_SLOTS` to the destructured deps (around the block starting at line 6-36 where `addItemToInventory` is listed).
   - Replace BOTH hardcoded `20` capacity checks:
     - Line 395: `itemCount >= 20` -> `itemCount >= MAX_INVENTORY_SLOTS` (create_test_item)
     - Line 449: `itemCount >= 20` -> `itemCount >= MAX_INVENTORY_SLOTS` (create_recipe_scroll)
   - Update the comment on line 393 from "max 20 non-equipped items" to "max non-equipped items".

IMPORTANT: Do NOT change any other `20` or `20n` values in these files. There are many other uses of the number 20 (stamina, AI scores, XP, affinity caps) that are unrelated to backpack capacity.
  </action>
  <verify>
    Run `grep -rn "itemCount >= 20\|>= 20\|<= 20\|max 20" spacetimedb/src/reducers/items.ts spacetimedb/src/reducers/commands.ts` and confirm zero matches related to inventory capacity. Then run `grep -rn "MAX_INVENTORY_SLOTS" spacetimedb/src/` and confirm the constant appears in helpers/items.ts (definition), index.ts (export+deps), reducers/items.ts (5 uses), and reducers/commands.ts (2 uses).
  </verify>
  <done>All 7 hardcoded inventory-capacity `20` values in server code replaced with MAX_INVENTORY_SLOTS. Constant set to 50.</done>
</task>

<task type="auto">
  <name>Task 2: Update client maxInventorySlots to 50</name>
  <files>src/composables/useInventory.ts</files>
  <action>
In `src/composables/useInventory.ts` line 387, change `maxInventorySlots: 20` to `maxInventorySlots: 50`.

Note: The client does not import server code, so this is a separate hardcoded value. Changing it here flows through to `InventoryPanel.vue` which displays "Slots: X / {maxInventorySlots}" and renders empty slot placeholders up to this count.
  </action>
  <verify>
    Run `grep -rn "maxInventorySlots" src/` and confirm the value is 50 in useInventory.ts. Run `grep -rn "\b20\b" src/composables/useInventory.ts` and confirm no inventory-related 20 remains.
  </verify>
  <done>Client UI shows backpack capacity as X / 50 and renders 50 slot placeholders.</done>
</task>

</tasks>

<verification>
- `grep -rn "= 20" spacetimedb/src/helpers/items.ts` shows only MAX_INVENTORY_SLOTS = 50 (no 20)
- `grep -rn "MAX_INVENTORY_SLOTS" spacetimedb/src/` shows 10+ references (1 definition, 1 export, 1 deps pass, 5 in items reducer, 2 in commands reducer, 1 in hasInventorySpace helper)
- `grep -rn "maxInventorySlots: 50" src/composables/useInventory.ts` returns a match
- No hardcoded `20` for inventory capacity anywhere in codebase
- Module publishes successfully: `spacetime publish uwr --project-path spacetimedb`
</verification>

<success_criteria>
- MAX_INVENTORY_SLOTS constant exists in helpers/items.ts set to 50
- All 7 server-side hardcoded `>= 20` / `<= 20` inventory checks replaced with MAX_INVENTORY_SLOTS
- Client maxInventorySlots changed from 20 to 50
- Module compiles and publishes without errors
</success_criteria>

<output>
After completion, create `.planning/quick/187-make-backpack-slot-count-a-centralized-c/187-SUMMARY.md`
</output>
