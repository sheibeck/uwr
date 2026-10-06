---
phase: 50-ledger-screens-character-and-economy
reviewed: 2026-10-06T00:00:00Z
depth: standard
scope: server (Plans 50-01 to 50-08; shared files reviewed by Phase 50 hunks only)
files_reviewed: 39
files_reviewed_list:
  - spacetimedb/src/data/crafting_rules.test.ts
  - spacetimedb/src/data/crafting_rules.ts
  - spacetimedb/src/data/faction_rules.test.ts
  - spacetimedb/src/data/faction_rules.ts
  - spacetimedb/src/data/inventory_rules.test.ts
  - spacetimedb/src/data/inventory_rules.ts
  - spacetimedb/src/data/item_rules.test.ts
  - spacetimedb/src/data/item_rules.ts
  - spacetimedb/src/data/item_stats.test.ts
  - spacetimedb/src/data/item_stats.ts
  - spacetimedb/src/data/item_usability.test.ts
  - spacetimedb/src/data/item_usability.ts
  - spacetimedb/src/data/perk_rules.test.ts
  - spacetimedb/src/data/perk_rules.ts
  - spacetimedb/src/data/vendor_pricing.test.ts
  - spacetimedb/src/data/vendor_pricing.ts
  - spacetimedb/src/helpers/character.ts
  - spacetimedb/src/helpers/economy.ts
  - spacetimedb/src/helpers/examine.ts
  - spacetimedb/src/helpers/item_stats_parity.test.ts
  - spacetimedb/src/helpers/items.ts
  - spacetimedb/src/helpers/renown.ts
  - spacetimedb/src/helpers/vendor_sale.ts
  - spacetimedb/src/index.ts
  - spacetimedb/src/reducers/characters.ts
  - spacetimedb/src/reducers/craft_quality.test.ts
  - spacetimedb/src/reducers/intent.ts
  - spacetimedb/src/reducers/item_rules_parity.test.ts
  - spacetimedb/src/reducers/items.ts
  - spacetimedb/src/reducers/items_crafting.ts
  - spacetimedb/src/reducers/quest_item_sale.test.ts
  - spacetimedb/src/reducers/vendor_buyback.test.ts
  - spacetimedb/src/reducers/vendor_pricing_parity.test.ts
  - spacetimedb/src/schema/tables.ts
  - spacetimedb/src/views/index.ts
  - spacetimedb/src/views/llm.test.ts
  - spacetimedb/src/views/types.ts
  - spacetimedb/src/views/vendor_buyback.test.ts
  - spacetimedb/src/views/vendor_buyback.ts
findings:
  critical: 1
  warning: 4
  info: 8
  total: 13
status: issues_found
---

# Phase 50: Code Review Report (server)

**Reviewed:** 2026-10-06
**Depth:** standard
**Files Reviewed:** 39. For the shared files `intent.ts`, `items.ts`, `items_crafting.ts`, `index.ts` and `characters.ts`, only the hunks from the 16 `(50-0x)` commits were reviewed, c781fa5e through e3c09e67.
**Status:** issues_found

## Summary

This review covers the Phase 50 server work:
- the import-free `@game-data` helpers: item stats, inventory capacity, `planCraft`, perk rules, faction tier, `canEquipItem`, item rules and vendor pricing
- the private `vendor_buyback` table and the `my_vendor_buyback` view
- the shared `sellInstanceToVendor` helper and the `buyback_last_sale` reducer
- the quest-item refusal on the sell paths
- the reorder of `craft_recipe` so it validates before it mutates
- the `delete_character` cleanup

Most of it holds up:
- **The view** reaches the table with two primary-key lookups (`player.id.find(ctx.sender)`, then `vendor_buyback.characterId.find(activeCharacterId)`) and never scans. It follows the same pattern as the existing `my_*` views.
- **`buyback_last_sale`** takes only `characterId`. Ownership goes through `requireCharacterOwnedBy` (`ctx.sender`). Every refusal comes before the first write: no row, gold, place, then bag. The refund is the stored price, the listing created by the sale is removed only when it was this sale's, and the row is deleted in the same transaction. SpacetimeDB reducers are serialized transactions, so a second claim cannot race the first; it gets `Nothing to buy back.`
- **Restoring the item:** affixes are snapshotted before the delete, stored as decimal strings, and restored on a fresh instance along with quality tier, craft quality, display name and flags.
- **`delete_character`** is the only place that deletes a character row, and it now removes the buy-back row.
- **Parity:**
  - `buyPrice` and `sellPayout` match the old rounding (perk step, then the Charisma step, rounded per stack).
  - `perkBonusByField` matches the old loop.
  - `canEquipItem` keeps the old order, the old messages and the same 12-slot set.
  - `hasBackpackSpace` matches the old capacity check.
  - `sumItemStats` matches the old examine sum.

The defects are at the edges:
- The window **Sell all junk** reducer is the one sell path that never got the quest-item refusal. The tests show the authors treat a junk quest template as possible.
- `planCraft` checks each material separately, so a recipe that repeats a material template passes the plan and then throws on the server.
- `sell_item` still lets a character sell to any npc id from anywhere. The buy-back place rule is built on that.
- Two pre-existing correctness bugs sit inside blocks this phase rewrote: Sell all junk leaves orphaned affix rows, and `craft_recipe` can apply the crafted result to the wrong item instance.

## Critical Issues

### CR-01: The `sell_all_junk` reducer still sells quest items

**File:** `spacetimedb/src/reducers/items.ts:210-224`
**Issue:** The owner's rule is that quest items are refused on every sell path, and the 50-07 summary says "No sell path can sell a quest item now". The typed `sell junk` path skips quest templates (`intent.ts:938`, `if (isQuestItemTemplate(tmpl)) continue;`). It even has a test for "a template that is both junk and quest" (`quest_item_sale.test.ts:500`). The window **Sell all junk** button calls the `sell_all_junk` reducer, which has no such check:

```ts
const template = ctx.db.item_template.id.find(instance.templateId);
if (!template || !template.isJunk) continue;
total += sellPayout(...);
ctx.db.item_instance.id.delete(instance.id);
```

A template with `slot: 'quest'` and `isJunk: true` is deleted and paid for, so selling destroys the quest item. The window path and the typed path also disagree on the same inventory. The two `sell_all_junk` tests (`quest_item_sale.test.ts:331-352`) only check the buy-back row, never a quest template.
**Fix:**
```ts
const template = ctx.db.item_template.id.find(instance.templateId);
if (!template || !template.isJunk) continue;
if (isQuestItemTemplate(template)) continue;   // import from '../data/item_rules'
```
Add a real-handler test that mirrors `quest_item_sale.test.ts:500`: a junk-and-quest stack survives `sell_all_junk`, the other junk is sold, and the gold equals only the non-quest payout. Also check that the client's "Sell all junk" preview count and gold use the same skip.

## Warnings

### WR-01: `planCraft` passes a recipe that repeats a material, and then the server throws

**File:** `spacetimedb/src/data/crafting_rules.ts` (the `planCraft` material loop, "Materials: each requirement against the raw count"); `spacetimedb/src/reducers/items_crafting.ts:164-168`
**Issue:**
- **The check:** each requirement is compared with the raw count on hand (`input.countOf(req.templateId) < req.count`). Requirements that share a template are merged into `consumes`, but the merged total is never checked.
- **The failure:** say `req1TemplateId === req2TemplateId` with counts 2 and 3, and 4 on hand. The plan returns `ok: true`, then the second `removeItemFromInventory` throws `SenderError('Not enough materials')` (`helpers/items.ts:425`). The transaction rolls back, so no items are lost. But:
  - the player gets a raw reducer error instead of the `Missing materials to craft this recipe.` line
  - the client, which reuses `planCraft` to pre-gate Craft, shows the recipe as craftable
- **Why it matters:** this breaks the stated contract that `planCraft` decides every refusal before the reducer mutates.
- **What the code already does:** the catalyst and reagent checks already subtract `consumed(...)`, so only the material step is inconsistent.

**Fix:** after building `consumes` from the requirements, validate the merged totals:
```ts
for (const c of consumes) {
  const have = input.countOf(c.templateId);
  if (have < c.count) {
    return { ok: false, reason: 'materials', message: 'Missing materials to craft this recipe.',
             templateId: c.templateId, have, need: c.count };
  }
}
```
Add a `planCraft` unit test and a `craft_recipe` real-handler test for req1 == req2.

### WR-02: `sell_item` never checks the npc, so the buy-back place rule rests on an unverified sale

**File:** `spacetimedb/src/reducers/items.ts:150-171`; `spacetimedb/src/helpers/vendor_sale.ts:158-183`
**Issue:** `sell_item` accepts any `npcId`. It does not check that the npc exists, is a vendor, or is at `character.locationId`. Before this phase that allowed remote selling, and with buy-back it now has more effects:
- The buy-back row records `locationId: character.locationId`, the seller's position, not the vendor's. The place rule ("same vendor or location") is therefore met by returning to wherever the player stood. The vendor named in `Go back to {npcName} to buy that back.` may be somewhere else entirely.
- A sale to a non-vendor or a missing npc still pays out and records a buy-back row naming that npc or `the vendor`. `quest_item_sale.test.ts:298` and `:309` pin this as intended.
- The typed `sell <item>` path does require a vendor at the location (`intent.ts:924-926`), so the two "single sale" paths disagree on who can buy the item.

**Fix:** in `sell_item`, before calling `sellInstanceToVendor`, mirror the typed path:
```ts
const npc = ctx.db.npc.id.find(args.npcId);
if (!npc || npc.npcType !== 'vendor' || npc.locationId !== character.locationId) {
  return failItem(ctx, character, 'There is no vendor here.');
}
```
Then update the two pinned tests. The same gap exists in `buy_item` (no location check) and `sell_all_junk` (no vendor at all); fix them in the same change if the owner agrees.

### WR-03: `sell_all_junk` deletes item instances but leaves their `item_affix` rows

**File:** `spacetimedb/src/reducers/items.ts:216-223`
**Issue:** The window Sell all junk path deletes `item_instance` rows without deleting their affixes. The typed `sell junk` path (`intent.ts:946-948`), `sell N` and `sellInstanceToVendor` all delete them first. `item_affix` is a public table, so orphaned rows build up and are sent to every subscriber, and any client code that joins affixes by instance id sees dead rows. Phase 50 rewrote this loop for `sellPayout` and left the two paths inconsistent.
**Fix:**
```ts
for (const affix of [...ctx.db.item_affix.by_instance.filter(instance.id)]) {
  ctx.db.item_affix.id.delete(affix.id);
}
ctx.db.item_instance.id.delete(instance.id);
```

### WR-04: `craft_recipe` can apply quality and affixes to an older item instead of the one just crafted

**File:** `spacetimedb/src/reducers/items_crafting.ts:180-183`
**Issue:**
- **What happens:** after `addItemToInventory`, the crafted instance is found with `.find(i => i.templateId === recipe.outputTemplateId && !i.equippedSlot && !i.qualityTier && !i.craftQuality)`. That matches the *first* unqualified, unequipped instance of the output template, and `by_owner` returns older rows first.
- **Where such instances come from:**
  - `buy_item`
  - `grant_item`
  - `take_loot` with no quality
  - since this phase, `restoreBuyback` (`vendor_sale.ts:89-100`), when the sold item had no quality
- **The effect:** the old item receives the essence affixes, the implicit quality affixes, `craftQuality` and the display name, and the new item stays plain. The plan's essence and reagents are still consumed.
- **Status:** this bug predates the phase, but the block was rewritten here and its validate-before-mutate guarantee does not cover it.

**Fix:** capture the instance ids before the add and pick the new row:
```ts
const before = new Set([...ctx.db.item_instance.by_owner.filter(character.id)].map((r) => r.id));
addItemToInventory(ctx, character.id, recipe.outputTemplateId, recipe.outputCount);
const newInstance = [...ctx.db.item_instance.by_owner.filter(character.id)]
  .find((i) => !before.has(i.id) && i.templateId === recipe.outputTemplateId);
```
Better still, have `addItemToInventory` return the inserted row. Add a test that crafts while an unqualified copy of the output is already in the bag.

## Info

### IN-01: When the item template is missing, buy-back refuses with "Your backpack is full."

**File:** `spacetimedb/src/reducers/items.ts:187-189`; `spacetimedb/src/helpers/items.ts:397-399`
**Issue:** `hasInventorySpace` returns `false` when the template no longer exists, so buying back an item whose template was removed is refused as a full bag. The row then stays until the next sale. `restoreBuyback` would also insert an instance pointing at a missing template if the gate were ever relaxed.
**Fix:** check `ctx.db.item_template.id.find(sale.templateId)` first and refuse with a distinct message (or delete the stale row).

### IN-02: Buying back a stackable sale drops the instance fields and merges into the first stack

**File:** `spacetimedb/src/helpers/vendor_sale.ts:84-88`
**Issue:** For a stackable template, `restoreBuyback` calls `addItemToInventory`, which ignores the stored `qualityTier`, `craftQuality`, `displayName`, flags and affixes and merges into the first unequipped stack. That is "the same stack" only if stackables never carry those fields.
**Fix:** document the assumption, or record and restore stackable sales as their own instance when any of those fields was set.

### IN-03: The listing a sale created is deleted on buy-back even when other sellers rely on it

**File:** `spacetimedb/src/reducers/items.ts:195-199`
**Issue:**
1. Character A's sale creates listing L.
2. Character B later sells the same template and quality, sees L already listed, and records no `listingId`.
3. A buys back, which deletes L.

The vendor stops offering the item B sold. Vendor listings are unlimited stock, so this only affects what the vendor offers.
**Fix:** accept it and document it, or keep the listing when any other buy-back row or sale has relied on it.

### IN-04: The perk message can show a percent the price math does not use

**File:** `spacetimedb/src/reducers/items.ts:126-128`; `spacetimedb/src/helpers/vendor_sale.ts:140-142`
**Issue:** `buyPrice` and `sellPayout` truncate a fractional perk percent (`wholePercent`), but the messages print the raw `vendorBuyDiscount` and `vendorSellBonus`. Buy discounts above 50 percent are also capped in the math but not in the text. No vendor perk is fractional today.
**Fix:** print `Math.trunc(pct)`, and `Math.min(trunc, 50)` for the buy discount.

### IN-05: The capacity rule's header claims a craft gate that does not exist

**File:** `spacetimedb/src/data/inventory_rules.ts:1-3`
**Issue:** The comment says capacity backs "buy, buy-back and craft gates". `craft_recipe` never calls `hasInventorySpace`, so a craft can push the bag past 50 slots. This predates the phase.
**Fix:** correct the comment, or add the gate to `planCraft` and its input.

### IN-06: A skipped third requirement can cancel the consumption of an identical first or second requirement

**File:** `spacetimedb/src/data/crafting_rules.ts` (`planCraft`, `if (req.templateId === recipe.req3TemplateId && recipe.req3Count == null) continue;`)
**Issue:** The skip compares template ids, not positions. If req1 or req2 shares `req3TemplateId` while `req3Count` is null, that requirement is dropped from `consumes` too. Later catalyst and reagent counts are then too generous, and the client shows the wrong consumption.
**Fix:** skip by index (`i === 2`) rather than by template id.

### IN-07: A temporary item sold before a logout can be bought back after it

**File:** `spacetimedb/src/helpers/vendor_sale.ts:99`; `spacetimedb/src/reducers/characters.ts:355-359`
**Issue:** The logout sweep deletes `isTemporary` instances, but a buy-back row for a sold temporary item survives logout. Buying it back recreates the conjured item. No code produces `isTemporary: true` yet.
**Fix:** refuse `record` for `isTemporary` instances, or delete the character's buy-back row in the logout sweep when the row is temporary.

### IN-08: Test gaps

**Files:** `spacetimedb/src/reducers/quest_item_sale.test.ts`, `craft_quality.test.ts`, `vendor_buyback.test.ts`
**Issue:** These cases have no test:
- `sell_all_junk` with a junk-and-quest template (CR-01)
- `craft_recipe` and `planCraft` with repeated material templates (WR-01)
- a craft while an unqualified copy of the output exists (WR-04)
- buy-back with a missing template (IN-01)
- a buy-back round trip that starts from the typed `sell <item>` path

Also, `items.ts` still destructures `isClassAllowed` (line 19), which is now unused.
**Fix:** add the listed cases and drop the unused destructure.

---

_Reviewed: 2026-10-06_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
