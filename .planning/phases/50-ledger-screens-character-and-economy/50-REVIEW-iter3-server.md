---
phase: 50-ledger-screens-character-and-economy
reviewed: 2026-10-07T05:04:23Z
depth: deep
iteration: 3
scope: "git diff bf98c7db..HEAD -- spacetimedb/src (plans 50-28, 50-29, 50-30, 50-40 and quick fix 142e5dcd): action_result table and my_action_result view, craft_recipe_count, salvage by chance, generated descriptions, combat outro length. Client consumer src/ledger/salvagePreview.ts read for parity only."
files_reviewed: 25
files_reviewed_list:
  - spacetimedb/src/data/action_result.test.ts
  - spacetimedb/src/data/action_result.ts
  - spacetimedb/src/data/crafting_rules.test.ts
  - spacetimedb/src/data/crafting_rules.ts
  - spacetimedb/src/data/llm_layers.test.ts
  - spacetimedb/src/data/llm_layers.ts
  - spacetimedb/src/data/recipe_rules.test.ts
  - spacetimedb/src/data/recipe_rules.ts
  - spacetimedb/src/data/salvage_loop.test.ts
  - spacetimedb/src/helpers/__snapshots__/claude_request.test.ts.snap
  - spacetimedb/src/helpers/action_result.ts
  - spacetimedb/src/helpers/combat_narration.test.ts
  - spacetimedb/src/index.ts
  - spacetimedb/src/reducers/characters.ts
  - spacetimedb/src/reducers/craft_count.test.ts
  - spacetimedb/src/reducers/hunger.ts
  - spacetimedb/src/reducers/items_crafting.ts
  - spacetimedb/src/reducers/recipe_discovery.test.ts
  - spacetimedb/src/reducers/salvage_result.test.ts
  - spacetimedb/src/schema/tables.ts
  - spacetimedb/src/views/action_result.test.ts
  - spacetimedb/src/views/action_result.ts
  - spacetimedb/src/views/index.ts
  - spacetimedb/src/views/llm.test.ts
  - spacetimedb/src/views/types.ts
findings:
  critical: 0
  warning: 1
  info: 8
  total: 9
status: issues_found
---

# Phase 50: Code Review Report (iteration 3, server)

**Reviewed:** 2026-10-07T05:04:23Z
**Depth:** deep. Cross-file checks covered:
- `craftBatch` → `planCraft` → `getItemCount` / `removeItemFromInventory` / `addItemToInventory`
- `salvage_item` → `salvageComponents` / `rollSalvage` / `salvageReagentDefs`, compared line by line with the client `src/ledger/salvagePreview.ts`
- `writeActionResult` → the `action_result` schema → the `my_action_result` view
- `delete_character` cleanup
- the inventory capacity gates in `bank.ts`, `items_trading.ts` and `helpers/items.ts`
- the trade finalize path

**Files Reviewed:** 25
**Status:** issues_found

## Summary

**What holds up** (checked by tracing the code, not taken from the SUMMARYs):

- **No craft → salvage loop.** `salvageComponents` (`crafting_rules.ts:696-810`) bounds every component in three ways:
  - each amount is at most `(req - 1) / outputCount` for every recipe that makes the item
  - the sum is at most `(total - 1) / outputCount` for every such recipe
  - full-luck worth is at most the item's `vendorValue`

  For the shapes that are actually generated, every req 1 secondary is capped to 0:

  | Recipe | Inputs | Most that can come back |
  |---|---|---|
  | Weapon or armor | 3 primary + 1 secondary | 1 primary |
  | Accessory | 2 primary + 1 secondary | 1 primary |

  The value cap holds too. A generated output is worth `3p + s - 2` (weapon or armor) or `2p + s - 2` (accessory), which is at least `p` for any `p, s ≥ 1`. Even with every roll hitting, the units fall on each cycle. I traced the property test grid, the 4000 random multi-recipe cases and the real-handler Darksteel Sword loop, and all are sound.
- **Determinism.**
  - The component rolls use splitmix64 over `salvageSeed(ctx.timestamp, instance.id, character.id)` (`crafting_rules.ts:813-833`).
  - No `Math.random`, `Date` or `new Date` appears in any reducer or rule file in scope.
- **Ownership and the equipped refusal.**
  - `craft_recipe`, `craft_recipe_count` and `salvage_item` call `requireCharacterOwnedBy` first.
  - `salvage_item` then checks the instance owner and refuses an equipped item (`items_crafting.ts:431-435`) before any read of rules or any write.
  - Banked items have `ownerCharacterId = 0n` (`bank.ts:69-73`), so they can be neither salvaged nor consumed.
  - `getItemCount` and `removeItemFromInventory` both skip equipped rows, so a craft can never consume worn gear.
- **All or nothing for craft ×N.**
  - The refusals happen before any write: count below 1, count above 99, recipe, discovered, output, then `planCraft` with the count.
  - `planCraft` multiplies every need by `n` before checking. The essence and reagent checks compare `have - alreadyConsumed` against `n`.
  - The mutation loop only removes what `plan.consumes` lists. Any throw rolls back the whole reducer transaction.
  - The `u64` count is compared as a BigInt, so no overflow is possible.
- **Private result row.**
  - `action_result` has no `public` flag.
  - `my_action_result` makes exactly two primary-key lookups: `player.id` by `ctx.sender`, then `action_result.characterId` by the active character. `activeCharacterId` is only ever set after `requireCharacterOwnedBy` (`characters.ts:30`, `creation.ts:318`), so no identity can see another character's row.
  - `delete_character` deletes the row (`characters.ts:271`).
- **Schema additivity.**
  - The only schema change is the new table, registered last, with 0 removed lines in `tables.ts`.
  - `craft_recipe_count` is a new reducer, so `craft_recipe` keeps its positional layout.
- **Scheduled guards.** No new scheduled reducer or scheduled table was added, so the guard coverage is unchanged.
- **fail() vs SenderError.**
  - Every player-facing refusal in the craft and salvage paths uses `fail` (via `failItem`) or the existing system line.
  - The only `SenderError` is the programming-error guard in `writeActionResult` (see IN-05).
- **Parity with the client preview.** `salvagePreview.ts` calls the same `salvageComponents` with the same inputs:
  - req1 to req3 with `?? 0n`
  - part `vendorValue`
  - `tier ?? 1n`
  - the slot material value (from MATERIAL_DEFS, which `ensureStarterItemTemplates` upserts into the template)
  - the same reagent pick `(instanceId + characterId) % defs.length`

  The only divergences are the documented single-recipe one and the missing-template one (IN-03).
- **Tests.** I ran the 10 in-scope test files: 473 passed, and the working tree was unchanged afterwards. They use the real handlers captured from `index.ts` on the strict mock, deep-equal the tables after refusals, and fail closed when a capture is missing.

**Main concern:** craft ×N writes up to 99 new bag rows in one call and ignores the 50-slot capacity, which every other add path enforces (WR-01). Nothing else rises above Info. No iteration-2 finding regressed: the CR-01 caps were replaced by the stricter 50-40 rule, the WR-03 material-only bag is intact (`items_crafting.ts:57`), and the CR-02 admin gate is outside this diff and unchanged.

## Warnings

### WR-01: `craft_recipe_count` can push the bag up to 99 rows over the 50-slot capacity in one call

**File:**
- `spacetimedb/src/reducers/items_crafting.ts:248-251` (the comment that records the decision)
- `spacetimedb/src/reducers/items_crafting.ts:318-323` (the instance loop)
- `spacetimedb/src/data/inventory_rules.ts:1-3`

**Issue:**
- **What happens.** `craftBatch` never consults `hasInventorySpace` or `getInventorySlotCount`. For a non-stackable output (every generated weapon, armor and accessory), it inserts `count` separate instances.
- **Example.** A character at 49/50 slots, holding 60 Copper Ore and 20 Scrap Cloth, calls `craft_recipe_count({ count: 20 })` and ends at 69/50.
- **Why it matters.**
  - Every other add path refuses at the cap: `buy_listing` / `buy_item`, buy-back, `withdraw_from_bank` (`bank.ts:118-121`) and trade finalize (`items_trading.ts:66-69`). Craft ×N is now the one route that grows a bag past capacity, and by up to 99 rows per click instead of 1.
  - The client gates only on room for the first item (50-29 decision), so it does not prevent this.
  - `salvage_item` also adds up to three new stacks (component, reagent, scroll) without a check, but it frees the salvaged row, so its net effect is at most +2.
- **Status.** 50-29 accepted this as parity with `craft_recipe` (T-50-125). The ×99 amplification was not part of that parity argument.

**Fix:** Refuse before any write when the batch needs more free rows than the bag has. A stack merge is free; otherwise one row per instance:
```ts
// craftBatch, after planCraft passes and before the removals (add getInventorySlotCount to deps)
const bag = [...ctx.db.item_instance.by_owner.filter(character.id)];
const merges = (output.stackable ?? false) && bag.some((r: any) => r.templateId === output.id && !r.equippedSlot);
const newRows = merges ? 0 : (output.stackable ?? false) ? 1 : Number(count);
if (getInventorySlotCount(ctx, character.id) + newRows > MAX_INVENTORY_SLOTS) {
  return failItem(ctx, character, 'Your backpack is full.');
}
```
- Also make `maxCraftCount` take the free slots as a bound, so the stepper agrees with the server.
- Add a real-handler test: at 49/50, a count-2 gear batch is refused and every table stays deep-equal.
- If the owner keeps the decision, record it in `inventory_rules.ts` as "craft ×N may exceed capacity by up to 99", not only "craft has none".

## Info

### IN-01: The bonus reagent sits outside the "never worth more than the item" cap

**File:** `spacetimedb/src/reducers/items_crafting.ts:528-548`; `spacetimedb/src/data/crafting_rules.ts:772-797`
**Issue:**
- The full-luck value trim covers only the components. The 12% reagent (template value 3, `helpers/items.ts:720-737`) comes on top.
- Example: a loot item worth 2 with an "of Strength" affix can return 1 Copper Ore (2) plus 1 reagent (3), so 5 > 2.
- It is not a loop: reagents are never recipe inputs, and `salvage_loop.test.ts:340-345` pins that. But the plan's statement "the value of the components under the item's own vendor value" does not hold for the whole salvage.

**Fix:** Either subtract the reagent's value from the cap before trimming, when `salvageReagentDefs` is non-empty, or state the exception in the 50-40 comment block (`crafting_rules.ts:603-622`).

### IN-02: The reagent and scroll rolls are still linear in the timestamp and correlated with each other

**File:** `spacetimedb/src/reducers/items_crafting.ts:530`, `:558`
**Issue:**
- The reagent roll is `(ts + 13·instanceId) % 100` and the scroll roll is `(ts + characterId) % 100`. For a fixed item and character, one roll determines the other. The 50-40 SUMMARY had to work around this in tests (deviation 1).
- There is no effect today, because generated recipes have no scroll template.
- The phase introduced `salvageRoll`, a proper mixed roll, but left these two on the old formula.

**Fix:** Use `salvageRoll(seed, BigInt(components.length))` for the reagent and `salvageRoll(seed, BigInt(components.length) + 1n)` for the scroll, and the same index for the reagent pick. Update the client preview's pick only if the pick formula changes.

### IN-03: Server and client salvage inputs diverge in two edge cases, and no test feeds one fixture through both

**File:**
- `spacetimedb/src/reducers/items_crafting.ts:477-487`: the server skips a missing part template and computes from the remaining parts
- `src/ledger/salvagePreview.ts:96-110`: the client marks the preview not knowable
- `salvagePreview.ts:127-129`: the client passes one recipe, while the server passes all of them

**Issue:**
- Both edge cases are conservative on the server (fewer parts give smaller caps), so neither breaks an invariant.
- But "parity by calling the same function" covers only the rule. The input assembly is duplicated, and drift there goes undetected.
- The `salvage_result.test.ts:658-783` grid derives its expectation from the same production functions, so it proves the wiring, not the parity.

**Fix:** Add one parity test that builds a fixture in the strict mock, runs `salvage_item` with a forced full-luck seed, and compares the granted components with `salvagePreview(...).components` for the same template, recipe and affixes.

### IN-04: If two recipes ever make one template, the value cap does not follow the cheapest recipe

**File:** `spacetimedb/src/data/crafting_rules.ts:714-738`, `:772-797`
**Issue:**
- The components come from the lowest-id recipe, and their worth is capped by the item's `vendorValue`, which reflects the recipe that generated the template.
- If a second recipe B makes the same template from cheaper inputs, crafting through B and salvaging returns A's dearer inputs (up to the unit sum cap of B). That converts cheap materials into dear ones at a chance.
- This is unreachable today: each generated key gets its own output template, and the name walk keeps names unique. The multi-recipe branch is supported but not value-safe.

**Fix:** Also cap the worth at `min over recipes of (sum of part value) - 1`, or document that one template has one recipe and assert it in `research_recipes`.

### IN-05: `writeActionResult` throws a `SenderError` for a programming error

**File:** `spacetimedb/src/helpers/action_result.ts:22-24`
**Issue:** An unknown kind is a server bug, but `SenderError` reports it to the caller as the caller's fault. Every caller passes a literal, so it is unreachable.
**Fix:** `throw new Error(...)`, or keep `SenderError` and add a comment explaining why.

### IN-06: The result card's `rarity` for a gear craft reads the row from before decoration

**File:** `spacetimedb/src/reducers/items_crafting.ts:313-323`, `:347`; `decorateCrafted` at `:230-235`
**Issue:**
- `lastRow` is the row `addItemToInventory` returned, before `decorateCrafted` sets `qualityTier: 'common'`. So `lastRow?.qualityTier` is always undefined and the card shows `output.rarity`, while the instance itself is common.
- Every generated output is `rarity: 'common'`, so this is invisible today. A non-common gear template crafted through a recipe would show the wrong rarity on the card.

**Fix:** Have `decorateCrafted` return the updated row (or its `qualityTier`), and use that for `rarity`.

### IN-07: Stale comments contradict the 50-40 rule

**File:**
- `spacetimedb/src/data/action_result.ts:25`: "received: the guaranteed salvage material (or the crafted item)". Salvage is never guaranteed now (owner, 2026-10-07), and no craft path writes a `received` line.
- `spacetimedb/src/data/crafting_rules.ts:594-601`: a leftover "SALVAGE: one rule for salvage_item and the client preview" header that now holds only `SALVAGE_REAGENT_CHANCE_PCT`, directly above the real 50-40 header.

**Fix:** Change the first to "received: a salvage component that came back (a chance, never guaranteed)". Merge the second header into the 50-40 block.

### IN-08: Salvage and craft ignore pending trade offers (pre-existing; latent)

**File:** `spacetimedb/src/reducers/items_crafting.ts:430-435`, `:309-311`; `spacetimedb/src/reducers/items_trading.ts:52-65`, `:239-250`
**Issue:**
- `offer_trade` keeps an acceptance while the offering player salvages the offered item or crafts away an offered stack.
- `finalizeTrade` silently drops missing instances (`.filter(Boolean)`) and moves the whole current stack, whatever `trade_item.quantity` recorded. The other side then receives less, or nothing, for its own items.
- No client calls the trade reducers today (`grep addTradeItem|offerTrade src` finds nothing outside the bindings), so the risk is latent. Craft ×N makes emptying an offered stack a single call.

**Fix:** In `finalizeTrade`, refuse and reset both acceptances when any offered instance is missing, has changed owner, or holds a quantity other than `trade_item.quantity`. Or refuse salvage and craft consumption of an instance that has a `trade_item` row.

---

_Reviewed: 2026-10-07T05:04:23Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
