# Phase 50: Ledger Screens: Character and Economy - Research

**Researched:** 2026-10-06
**Domain:** Four Vue 3 screens (Inventory, Stats, Vendor, Crafting) over existing SpacetimeDB item, economy, crafting and renown reducers, plus a small additive server change (buy-back table, view and reducer; quest-item refusal; shared pure helpers under `@game-data`)
**Confidence:** HIGH for everything read from the repo or the local database in this session; MEDIUM for three SDK-behavior items tagged `[ASSUMED]` in the Assumptions Log. No web or library lookup was needed: every question is about code in this repository, so the research-plan seam (Context7 and web providers) was not used.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Owner decisions (2026-10-06, in chat)**
- **Buy-back is built on the server.** It adds one small private table holding each character's last sale (one row per character, replaced on each sale) and a `buyback_last_sale` reducer.
  - The reducer refunds exactly the sale price and restores the same item instance or its stack, then clears the row.
  - Rules:
    - Only the owning character can buy back.
    - The character must have enough gold.
    - The character must be at the same vendor or location as the sale, or the action is refused with a `fail()` message.
    - Sell all junk records nothing for buy-back. Only the last single Sell counts.
  - The client reads it through a per-sender view or a filtered subscription. A public table must never expose other players' sales.
  - Adding a table is additive: publish locally with `--break-clients`, never use `--clear-database`, check `admin_llm_status` key_length 108 before and after, and regenerate the bindings.
  - Tests:
    - sell, then buy back restores the item and the gold
    - a second sale replaces the first
    - Sell all junk does not record
    - wrong character, not enough gold, and wrong place are each refused
- **Pacing:** plan and build all four screens in one pass, then let the owner try them. No mid-phase pause.

**Owner decisions after the UI-SPEC draft (2026-10-06, owner in chat)**
- **Quest items are refused on the server too.** `sell_item` fails for quest items with `Quest items can't be sold.` This is a code-only change, published with the buy-back work, and it gets a test.
- **Craft quality shows the single deterministic result.** It reads `Quality: {Tier}`, with a hint for what would raise it. There is no odds bar and quality is not made random (no balance change).

**Screens and shells**
- Each screen fills the Phase 45 drawer (desktop) or sheet (mobile) for its `ActiveScreen` value, replacing the placeholder. Opening and closing, focus trap and Esc stay as Phase 45 built them.
- The Nearby vendor action from Phase 47 opens the Vendor screen for that NPC. Crafting is reached from the existing screen entry points. Phase 45 tabs, Bag and More decide which screen opens on mobile.
- The design source is the inventory, stats, vendor and crafting screens in `UWR Ledger Screens.dc.html`, desktop and mobile. Re-import it fresh from the claude_design MCP project "Unwritten Realms" (never cached).

**Data and server reuse (confirm in research)**
- **Existing reducers to reuse:** equip and unequip, `salvage_item`, `sell_item`, `sell_all_junk`, `buy_item`, `research_recipes` (Discover recipes), craft, and the renown perk choice. Research confirms exact names and arguments.
- **Rapport modifiers and crafting quality odds:**
  - Use existing server data, imported through `@game-data` where possible. Never duplicate server constants on the client (memory rule: the server is the source of truth).
  - If a value exists only inside a server helper that imports `spacetimedb/server`, move the pure math into `spacetimedb/src/data/` (import-free). This is the same pattern Phase 49 used for `race_bonuses.ts`.
- **Derived stats** use the same pure math the server uses, shared the same way.
- **Item comparison** (up/down arrows) compares the selected item's stats with the item equipped in the same slot. Affix and craft-quality bonuses are included, matching the a3d examine helper's per-instance stat sum.
- **Quest items** are marked unsellable and have no Sell button. The server refusal stays the source of truth.
- **Usable by you** means the item's armor or weapon category and required level fit the active character. The rule comes from existing server data.

**Recommended defaults (owner may revise at UAT)**
- **Salvage confirmation:** salvaging an item above common rarity, or an equipped item, asks once first, reusing the Phase 49 Start over confirmation pattern. Common items salvage straight away.
- **Sell all junk** shows how many items it will sell and for how much gold before it runs.
- **Inventory filters:** All, Gear, Materials, Food, as the requirement says. The slot count shows used out of capacity.
- **Faction standing** shows every faction the character has standing with, as a bar per faction with a tier label.
- **Renown perk choice** reuses the existing reducer, and shows only when a choice is pending.

**Established patterns (CONTEXT code_context)**
- Design guards enforced by existing tests (`designContract`, `colors.guard`, `tokens.client`, `scrollbars`): no literal colors, no `v-html`, no `<svg`; Phosphor icons and Inter only; font sizes 10/12/14/20, weights 400/500; spacing 4/8/16/24/32/48/64; no new tokens (the pin stays 23); text nodes only with the img-onerror escape test; no `replaceAll`, `.at` or `Object.hasOwn`.
- Server changes are additive only. Publish locally with `--break-clients`, never clear the database, check the key before and after.
- Reducer calls use object syntax.

### Claude's Discretion
- Component layout under `src/screens/` or new `src/inventory`, `src/stats`, `src/vendor` and `src/crafting` folders.
- Exact table and sort behavior where the design doesn't specify it.
- How to split the plans. Execution is sequential on the main checkout.

### Deferred Ideas (OUT OF SCOPE)
- The Keeper's assessment on Stats (LDG-F1).
- The live UAT of all four screens, at the end-of-milestone UAT pass.

Out of scope (CONTEXT phase boundary): the LLM "Keeper's assessment" on Stats; Map, Social and World events (Phase 51); balance changes; Keeper Bible and route-block changes.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LDG-01 | Inventory: equipment slots and backpack side by side, filters (All, Gear, Materials, Food), slot count and gold | Q4 (capacity constant, slot count rule), Q5 (item_instance, item_template bindings), Q6 (Bag tab opens `bag`), Q10 (test map) |
| LDG-02 | Inspector: rarity, tier, stats compared with equipped (up/down), flavor, sell value, Equip / Salvage | Q1 (equip, unequip, salvage, use, learn scroll refusals), Q4 (per-instance stat sum, usable-by-you, sell value), Pitfalls 1, 2, 8 |
| LDG-03 | Stats: base stat bars with gear bonus, derived table, renown rank with perk choice, faction standing | Q9 (character stats are BASE), Q7 (perk names), Q4 (faction tier, percent scale), Q5 (renown, pending perks, standings) |
| LDG-08 | Vendor: name, role, faction, quote, rapport, for-sale table with "usable by you" and Buy | Q1 (buy_item), Q4 (buy price and rapport helper), Q5 (vendor_inventory by npc), Q6 (open for an NPC id), Open Questions 4, 15 |
| LDG-09 | Vendor: sellables with value, Sell, Sell all junk, buy back the last sale; quest items unsellable | Q1 (sell_item, sell_all_junk), Q2 (buy-back design), Q3 (quest-item marker and the three NL sell paths) |
| LDG-10 | Crafting: materials on hand, recipe list with category tabs and "only craftable", have against need | Q1 (research_recipes, craft_recipe), Q4 (recipe rules, `isGearRecipe`), Q5 (recipe_discovered, recipe_template) |
| LDG-11 | Selected recipe: quality, optional reagent / affix, Craft, Discover recipes reachable | Q4 (quality hint helper), Q1 (craft refusals happen after inputs are consumed: Pitfall 3) |
</phase_requirements>

## Summary

All eleven reducers the screens need already exist with object arguments and generated bindings (`src/module_bindings/*_reducer.ts`); only `buyback_last_sale` is new. None of the item, recipe or perk tables are bound on the client today: Phase 47's hub binds `character`, `faction`, `my_faction_standings`, `renown`, `renown_perk`, `ability_template` and `npc` (by location) but not `item_instance`, `item_template`, `item_affix`, `vendor_inventory`, `recipe_template`, `recipe_discovered` or `pending_renown_perk`, and its `GameReducers` type lists none of the item reducers. The recommended shape is a second session-owned hub (`src/ledger/ledgerData.ts`, the Phase 49 `creation` precedent) so `gameData.ts`, `context.ts`, `queries.ts` and their fakes stay untouched.

Seven findings change the plan and are not visible in the UI-SPEC. (1) The server does not gate Equip by level (`items.ts:454-456` removed it on purpose) and does not check vendor proximity on buy or sell; the UI-SPEC's "Requires level" rule is client-only and contradicts the world-tier design (Open Question 4). (2) `sell_item` deletes the instance and its affixes today (`items.ts:183-186`), so buy-back must snapshot the affixes; and the natural-language `sell` path in `reducers/intent.ts` (lines 955-1110) duplicates all of the sell logic three times, so the quest-item refusal and the buy-back record must live in one shared helper both call (Q2, Q3, Open Question 3). (3) There is no quest marker on items today: quest items live in a separate `quest_item` table and never become `item_instance` rows; the only convention is the string `'quest'` in `salvage_item`'s slot list (Q3). (4) `craft_recipe` returns (commits) after it has already consumed inputs and added the output when an essence is too weak or a reagent is missing, so the UI must pre-gate every one of those cases (Pitfall 3). (5) `character.str` and the other stat columns are BASE values; gear is added at read time, and `armorClass` and the derived chances are totals (Q9). (6) The existing `/faction` helper `standingLabel` labels negative standings one tier more severely than the approved UI-SPEC rule (Open Question 5). (7) Passive perks chosen through `choose_renown_perk` store a key (`renown_rank2_iron_will`) that the server's perk-bonus lookup never matches against pool keys (`iron_will`), so those perks currently have no mechanical effect, including vendor discounts (Q7, Pitfall 9).

Nothing creates recipes, factions or opening vendor stock in code: `recipe_template` and `faction` have no insert site, and `vendor_inventory` is filled only by player sales. The owner's local database confirms it (both tables empty, one vendor, no stock, character at a different location than the vendor). Crafting and Faction standing will show empty states on the live stack; tests need fixtures, and the owner's try-out needs the data to exist (Open Question 12).

**Primary recommendation:** Ship the server work first (import-free `@game-data` helpers, the `vendor_buyback` private table with a per-sender view, `buyback_last_sale`, the shared sell helper with the quest refusal, local publish, bindings regenerated), then a session-owned `LedgerData` hub and the shell changes (header meta slot, screen args for the vendor NPC), then the four screens, so every client number comes from the same pure function the server calls.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Equip, unequip, use, salvage, learn scroll, craft, research, perk choice (rules and mutation) | API / Backend (existing reducers) | none | Server is source of truth; client sends object-arg calls and renders subscribed rows (no optimistic state) |
| Sell, Sell all junk, buy, buy-back (gold and item mutation) | API / Backend (`items.ts`, new shared sell helper) | Database (private `vendor_buyback`) | Price, refund and slot rules must be one server computation; the client never sends a price |
| Buy-back visibility (own last sale only) | Database (private table plus per-sender view) | none | Public table would leak other players' sales (owner rule) |
| Price, rapport, usable-by-you, per-instance stat sum, faction tier, craft quality rule, capacity constant | `spacetimedb/src/data/` import-free helpers | Browser (imports through `@game-data`) | One function, two callers, so projection equals server result |
| Comparison deltas, stat bars, bag sort and filters, recipe have/need, reagent eligibility | Browser (pure models in `src/ledger`, `src/inventory`, `src/stats`, `src/vendor`, `src/crafting`) | none | Pure derivations over subscribed rows |
| Subscriptions for items, affixes, templates, vendor stock, recipes, pending perks, last sale | Browser (session-owned `LedgerData` hub) | Database (public tables filtered by indexed column; view for last sale) | Filtered subscriptions are a scoping aid, not access control |
| Drawer and sheet shells, meta slot, vendor target, tabs | Browser (`AppFrame`, `screens.ts`, `FrameControls`) | none | Phase 45 shells stay; this phase adds meta and args |
| Server results and refusals visible while a screen covers the feed | Browser (notice line over `game.feed`) | none | Refusals are private `system` rows; the drawer hides the feed |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vue | ^3.5.43 | View layer | Already the client framework [VERIFIED: package.json] |
| spacetimedb (npm) | ^2.10.1 | SDK, `toSql`, generated bindings | Already used by `src/game/queries.ts` [VERIFIED: package.json, src/game/queries.ts] |
| @phosphor-icons/vue | 2.2.1 | Icons, regular weight | Only allowed icon library (designContract test) [VERIFIED: package.json] |
| vitest | ^5.0.2 | Tests (root and `spacetimedb/`) | Existing [VERIFIED: package.json, spacetimedb/package.json] |
| @vue/test-utils / happy-dom | 2.5.1 / 20.14.5 | Component tests | Existing [VERIFIED: package.json] |
| vue-tsc | ^3.3.11 | Type check (`vue-tsc -b` in `pnpm build`) | Existing [VERIFIED: package.json] |

### Supporting (reuse, do not rebuild)
`src/net/bindTable.ts` (`TableBinding`, `applied`), `src/game/keyedBinding.ts` (`createKeyed`, `idListKey`, `keyedRows`), `src/game/queries.ts` pattern (`toSql`, `tables.x.where(...)`), `src/console/cleanServerText.ts`, `src/console/feedStore.ts` (read-only `entries`), `src/frame/useBreakpoint.ts`, `src/rails/xp.ts` (`xpProgress`), `src/screens/EmptyState.vue`, `src/frame/focusTrap.ts`, `@game-data/{renown_data,xp,mechanical_vocabulary,crafting_rules,class_stats,combat_scaling}` [VERIFIED: files read].

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Session-owned `LedgerData` hub | Extend `createGameData` / `GameQueries` | Extending forces edits to `gameData.ts`, `context.ts`, `queries.ts` and the typed `queries` literal in `gameData.test.ts:30-76`; the separate hub (Phase 49 precedent) touches none of them |
| Snapshot row for buy-back (new instance on restore) | Escrow the instance (owner id sentinel) | Escrow keeps the id but leaves orphan public `item_instance` rows when a sale is replaced or a character is deleted; snapshot leaves at most one small private row per character |
| `item_affix` OR-chain keyed by "rolled" instances | A new `my_item_affixes` per-sender view | The view is one more server surface; the chain reuses the Phase 47 `keyedIdList` pattern (Open Question 14) |

**Installation:** none. No packages are added.

## Package Legitimacy Audit

No external packages are installed or added by this phase, so the package legitimacy gate is not applicable.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none added) | - | - | - | - | - | - |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Findings by Research Question

### Q1. Exact reducers, arguments and server refusals

Every reducer below calls `requireCharacterOwnedBy` first, which throws `SenderError` (`Login required`, `Character not found`, `Not your character`) [VERIFIED: helpers/events.ts:25-39]. A thrown error rejects the client promise (UI copy: `Couldn't send that. Try again.`). Every other refusal is `fail(...)` = `appendPrivateEvent(... 'system', msg)`, which does NOT throw: the reducer returns normally and the transaction commits [VERIFIED: helpers/events.ts:123-125]. Client call names are the camelCase of the reducer name, with an object argument, and all eleven bindings already exist [VERIFIED: src/module_bindings/*_reducer.ts].

| Reducer (client call) | Arguments | `fail` refusals (kind `system`) | Success and notes |
|-----------------------|-----------|----------------------------------|-------------------|
| `equip_item` (`equipItem`) items.ts:438-516 | `{ characterId, itemInstanceId }` | `Cannot change equipment during combat`; `Item not found`; `Item does not belong to you`; `Item template missing`; `Cannot equip this item` (stackable); `Your class cannot wield this weapon type`; `Your class cannot wear this armor type`; legacy classes: `Weapon type not allowed for this class` / `Class cannot use this item`; `Invalid slot` | No message on success. NO level check (items.ts:454-456 removed it), no bag-space check. Two-handed main hand auto-unequips off hand; the item previously in the slot returns to the bag |
| `unequip_item` (`unequipItem`) items.ts:518-535 | `{ characterId, slot: string }` | `Cannot change equipment during combat` | Silent no-op when the slot is empty. NO bag-full check: it can push the bag past 50 |
| `use_item` (`useItem`) items.ts:897-1060 | `{ characterId, itemInstanceId }` | `Item not found`; `Item does not belong to you`; `Item template missing`; `Cannot use this during combat`; `Item cannot be used` (name not in a 10-key set); `Item is on cooldown.` | Only `bandage`, `basic_poultice`, `travelers_tea`, `simple_rations` have effects (kind `heal`); `torch`, `whetstone`, `kindling_bundle`, `rough_rope`, `charcoal`, `crude_poison` are consumed and answer `You use X, but nothing happens.` (Pitfall 7) |
| `salvage_item` (`salvageItem`) items_crafting.ts:350-440 | `{ characterId, itemInstanceId }` | `Item not found`; `Not your item`; `Unequip item first`; `Item template not found`; `Cannot salvage junk items`; `Cannot salvage this item type` (twice: slots consumable/food/resource/quest/junk, and any non-equipment slot) | `reward` lines (materials, bonus reagent 12%, recipe scroll by INT). No combat or bag-space check |
| `sell_item` (`sellItem`) items.ts:154-217 | `{ characterId, itemInstanceId, npcId }` | `Item not found`; `Item does not belong to you`; `Unequip item first`; `Item template missing` | Sells the WHOLE stack. `reward` line `You sell X for N gold.`. NO vendor or location check on `npcId`; NO quest-item refusal today (Q3) |
| `sell_all_junk` (`sellAllJunk`) items.ts:219-250 | `{ characterId }` | none | `reward` line `You sell N junk item(s) for G gold.` (also with N = 0). Takes no vendor, so it sells anywhere; does not list the items for resale |
| `buy_item` (`buyItem`) items.ts:105-152 | `{ characterId, npcId, itemTemplateId }` | `Item not sold by this vendor`; `Item template missing`; `Backpack is full`; `Not enough gold` | Buys ONE unit; vendor stock never decreases; ignores the row's `qualityTier` (the bought item is a plain template instance). `reward` line `You buy X for N gold.` |
| `research_recipes` (`researchRecipes`) items_crafting.ts:22-85 | `{ characterId }` | none (uses `appendPrivateEvent`): `Crafting is only available at locations with crafting stations.` | `system` lines `You discover X because you have ...` or `You discover nothing new.`. Only consumable recipes are auto-discoverable; gear recipes need a salvage scroll |
| `craft_recipe` (`craftRecipe`) items_crafting.ts:103-303 | `{ characterId, recipeTemplateId, catalystTemplateId?, modifier1TemplateId?, modifier2TemplateId?, modifier3TemplateId? }` (options: omit or `undefined`) | Station message (as above, `appendPrivateEvent`); `Recipe not found`; `Recipe not discovered`; `Missing materials to craft this recipe.`; AFTER consuming inputs: `Essence tier too low for this craft quality`, `Missing catalyst (Essence)`, `Missing modifier: X`, `Must provide at least one reagent when using an Essence` | `reward` line `You craft X.`. No bag-space check. Reagents without an essence are silently ignored (not consumed). Quality comes from the recipe's FIRST material (Q4) |
| `learn_recipe_scroll` (`learnRecipeScroll`) items_crafting.ts:305-348 | `{ characterId, itemInstanceId }` | `Item not found`; `Not your item`; `Template not found`; `Not a recipe scroll` (name must start `Scroll:`); `No recipe found for this scroll` | `You have learned: X` or `You already know: X` (both `system`); the scroll is consumed either way |
| `choose_renown_perk` (`chooseRenownPerk`) renown.ts:111-120 -> renown_perk.ts:19-98 | `{ characterId, perkId }` (`perkId` = a `pending_renown_perk.id`) | `Character not found`; `No pending renown perk choices`; `Invalid perk selection` (all through `fail`) | Passive: inserts `renown_perk`; active (non-empty `kind`): inserts an `ability_template` with `source 'Renown'`. Clears that rank's pending rows, then `offerNextRenownPerk` may enqueue the NEXT rank's LLM generation job (a paid call in a live run) |
| `buyback_last_sale` (`buybackLastSale`) NEW | `{ characterId }` | see Q2 | `reward` line `You buy back X for N gold.` |

### Q2. Buy-back design (O1)

**What happens to a sold instance today.** `sell_item` deletes the `item_affix` rows (items.ts:183-185) and the `item_instance` (186), pays gold (187-190), and, if the NPC row exists and is a vendor and no listing for the same template and quality tier exists, inserts a `vendor_inventory` resale row at 2x `vendorValue` (min 10) (191-208). The instance is not moved to vendor stock; only a template listing is. Vendor stock never decreases on purchase, and `buy_item` ignores the listing's `qualityTier`, so a vendor listing can never give the item back with its affixes.

**New table (private, one row per character).** CLAUDE.md rules apply (two-argument `table`, `0n` placeholders only for autoInc, `characterId` as primary key needs none):

```typescript
// spacetimedb/src/schema/tables.ts  (add to the schema({...}) list as vendor_buyback)
export const VendorBuyback = table(
  { name: 'vendor_buyback' }, // no `public: true`: only my_vendor_buyback exposes the caller's own row
  {
    characterId: t.u64().primaryKey(),   // one row per character, replaced on each sale
    npcId: t.u64(),
    npcName: t.string(),                 // vendor name at sale time (client needs no NPC lookup)
    locationId: t.u64(),                 // character.locationId at sale (the place rule)
    templateId: t.u64(),
    itemName: t.string(),                // displayName ?? template.name
    rarity: t.string(),                  // qualityTier ?? template.rarity
    quantity: t.u64(),
    price: t.u64(),                      // gold actually paid out = the exact refund
    qualityTier: t.string().optional(),
    craftQuality: t.string().optional(),
    displayName: t.string().optional(),
    isNamed: t.bool().optional(),
    isTemporary: t.bool().optional(),
    affixesJson: t.string(),             // [{ affixType, affixKey, affixName, statKey, magnitude: "<decimal string>" }]
    listingId: t.u64().optional(),       // vendor_inventory row THIS sale created (undo on buy-back)
    soldAt: t.timestamp(),
  }
);
```

Pitfall: `item_affix.magnitude` is `i64` (a bigint), which `JSON.stringify` rejects. Store magnitudes as decimal strings and `BigInt()` them back.

**How `sell_item` records it.** Extract the sell body into one server helper (for example `helpers/vendor_sale.ts`: `sellInstanceToVendor(ctx, character, instance, template, npcId, { record })`) used by `sell_item` and by the single-item NL sell in `intent.ts` (Open Question 3). Order inside it: (1) refuse a quest template (Q3); (2) compute the payout with the shared `sellPayout`; (3) snapshot the affixes BEFORE the deletes at items.ts:183-186; (4) delete affixes and instance, pay gold; (5) insert the resale listing if needed and keep its returned row id as `listingId` (only when this sale created it); (6) when `record` is true, `ctx.db.vendor_buyback.characterId.find` then `update`, else `insert` (replace); (7) the existing `reward` line. `sell_all_junk` and the NL "sell junk" and "sell N" paths call nothing that records, and never touch an existing row.

**Reducer `buyback_last_sale({ characterId })`.** Arguments are only the character: price, item and place come from the row, so a client can never supply a price. Server refusal order matches the UI-SPEC state table (gold, place, bag):

```typescript
// reducers/items.ts (registerItemReducers; hasInventorySpace and fail are already in deps)
spacetimedb.reducer('buyback_last_sale', { characterId: t.u64() }, (ctx, args) => {
  const character = requireCharacterOwnedBy(ctx, args.characterId);   // wrong owner: SenderError, row untouched
  const sale = ctx.db.vendor_buyback.characterId.find(character.id);
  if (!sale) return failItem(ctx, character, 'Nothing to buy back.');
  if ((character.gold ?? 0n) < sale.price) return failItem(ctx, character, 'Not enough gold to buy that back.');
  if (character.locationId !== sale.locationId) return failItem(ctx, character, `Go back to ${sale.npcName} to buy that back.`);
  if (!hasInventorySpace(ctx, character.id, sale.templateId)) return failItem(ctx, character, 'Your backpack is full.');
  ctx.db.character.id.update({ ...character, gold: (character.gold ?? 0n) - sale.price });
  restoreSnapshot(ctx, character.id, sale);          // stackable: addItemToInventory merge; else insert instance, then re-insert affixes with the new instance id
  if (sale.listingId != null && ctx.db.vendor_inventory.id.find(sale.listingId)) ctx.db.vendor_inventory.id.delete(sale.listingId);
  ctx.db.vendor_buyback.characterId.delete(character.id);
  appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward', `You buy back ${sale.itemName} for ${sale.price} gold.`);
});
```

- **Same price:** `price` is stored at sale (perk bonus and CHA already applied), so a later rapport change cannot create profit.
- **Same vendor or location:** compare `character.locationId` with the stored `locationId` (the sale did not verify the vendor was nearby either, Open Question 17, so the character's own location at sale time is the trustworthy anchor). `npcName` is only for the message.
- **Free slot unless it stacks (A24):** use `hasInventorySpace(ctx, characterId, templateId)` [VERIFIED: helpers/items.ts:397-407; already in `reducerDeps`, index.ts:~715]. Stackable items merge through `addItemToInventory` (helpers/items.ts:360-388), which ignores quality fields (correct for stackables).
- **The restored item is a new instance id** with the same template, quantity, `qualityTier`, `craftQuality`, `displayName`, flags and affixes. The UI-SPEC wording "same instance" is satisfied semantically; no client state may key on the old id past the sale.
- **Sell all junk records nothing and leaves an existing row alone** (owner rule; UI-SPEC "never creates or changes the card").
- **Cleanup:** add `ctx.db.vendor_buyback.characterId.delete(characterId)` to `delete_character` (reducers/characters.ts:139-271, next to the corpse cleanup).

**Per-sender read path.** A public view over the private table, the exact `my_combat_aggro` / `my_faction_standings` pattern (a `player.activeCharacterId` lookup and an index or primary-key `find`; no `.iter()`) [VERIFIED: views/faction.ts, views/combat.ts:4-77, views/llm.ts:137 uses primary-key `find` in a view]:

```typescript
// spacetimedb/src/views/vendor_buyback.ts   (add VendorBuyback to ViewDeps in views/types.ts and to registerViews({...}) in index.ts:336)
spacetimedb.view({ name: 'my_vendor_buyback', public: true }, t.array(VendorBuyback.rowType), (ctx: any) => {
  const player = ctx.db.player.id.find(ctx.sender);
  if (!player?.activeCharacterId) return [];
  const row = ctx.db.vendor_buyback.characterId.find(player.activeCharacterId);
  return row ? [row] : [];
});
```

Client: `toSql(tables.myVendorBuyback)` (unfiltered, scoped server-side, like `myFactionStandings`), table handle `conn.db.myVendorBuyback`, row type `VendorBuyback` (private-table row types are generated into `types.ts`, as `LlmAdminState` is) [VERIFIED: src/module_bindings/types.ts:813].

**Migration and additive-publish safety.** A new private table, a new public view and a new reducer are additive (no existing column changes). Precedent: Phase 46.1 published a new table with defaulted columns locally with `--break-clients` and no clear [CITED: .planning/phases/46.1-round-based-combat-engine/46.1-09-PLAN.md:107]; Phase 48 added the `my_combat_aggro` view the same way [CITED: .planning/phases/48-combat-encounter/48-14-SUMMARY.md:134]. Procedure for the executor (research ran none of it):
1. Before: `spacetime sql --server local uwr "SELECT key_set, key_length FROM admin_llm_status"` (read `true | 108` this session).
2. `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null` (never `--clear-database`, never `--server maincloud`; stdin closed so a clear prompt fails fast).
3. After: logs show the update and no panic; the key check again reads 108.
4. `pnpm spacetime:generate -y`; commit the regenerated `src/module_bindings` (never hand-edit).

Ordering consequence: `src/ledger/queries.ts` references `tables.myVendorBuyback`, which does not exist until step 4, so the server work and bindings must land before the client files that import it.

### Q3. The quest-item refusal in `sell_item` (O2)

- **No instance-level marker exists.** `item_template.slot` holds the 12 equipment slots, `junk`, `material`, and (via `create_item_template`'s whitelist) `resource` and `consumable` (items.ts:60); `isJunk` is the only per-template flag. The local database's slots are exactly equipment, `junk` and `material` [VERIFIED: `spacetime sql` on `item_template`].
- **Real quest items are not items.** They are rows in the separate `quest_item` table (`characterId`, `questTemplateId`, `name`, `discovered`, `looted`; tables.ts:197-215) created by `reducers/combat.ts:~543` and `search.ts`; they never become `item_instance` rows, so they can never reach `sell_item`.
- **The only existing convention** is the string `'quest'` inside `salvage_item`'s `nonSalvageSlots` (items_crafting.ts:362); `ITEM_CATEGORIES` in `mechanical_vocabulary.ts:267-271` has `quest_item` as a generation category, not a stored slot.
- **Recommendation:** define `isQuestItemTemplate(template) => template.slot === 'quest'` once in a new import-free `data/item_rules.ts`, used by the shared sell helper (server) and by `itemModel.ts` (client category and the missing Sell button). Test with a synthetic template seeded at `slot: 'quest'` (asserts: refusal line `Quest items can't be sold.`, instance kept, gold unchanged, no buy-back row). Tell the owner honestly that, today, no generated item can carry the marker; the refusal is a guard for when one does (Open Question 13).
- **The refusal must cover all four sell paths.** `submit_intent`'s `sell junk`, `sell N <item>` and `sell <item>` (intent.ts:955-985, 988-1046, 1048-1110) duplicate the sell logic and would sell a quest template. Route the single-item path through the shared helper; for junk and sell-N, skip or refuse quest templates with the same line.

### Q4. Shared pure helpers to move under `@game-data`

The alias maps to `spacetimedb/src/data` (vite.config.ts, tsconfig.json paths) and `src/gameDataAlias.test.ts` already pins that `race_bonuses.ts` imports only `./class_stats`. Every new module below must be import-free (or import only other `data/` files), browser-safe and ES2020 (no `replaceAll`, `.at`, `Object.hasOwn`), and gets an alias-resolution and import-specifier test like the `race_bonuses` block.

| Helper | Where it lives today | Imports `spacetimedb/server`? | Plan |
|--------|----------------------|-------------------------------|------|
| Per-instance item stats (template + affixes + craft-quality implicits) | Inline in `helpers/examine.ts:161-184` (import-free, but under `helpers/`, so NOT reachable through `@game-data`); duplicated in `helpers/items.ts:269-320` (`getEquippedBonuses`) and `322-342` | `examine.ts`: no. `items.ts`: yes (`SenderError`, schema tables) | New `data/item_stats.ts`: `ITEM_STAT_KEYS` (12 affix stat keys plus `weaponBaseDamage`, `weaponDps`), `sumItemStats(template, affixes)`. `examine.ts` calls it (its `examine.test.ts` guards the output). Do NOT rewrite `getEquippedBonuses`; add a differential test that sums equipped instances with the helper and compares to it |
| Derived stats | `recomputeCharacterDerived`, `helpers/character.ts:56-154` | yes | Do NOT move. The derived values are STORED on the `character` row (`hitChance`, `dodgeChance`, `parryChance`, `critMelee`, `critRanged`, `critDivine`, `critArcane`, `armorClass`, `perception`, `search`, `ccPower`, `vendorBuyMod`, `vendorSellMod`), so the client reads them. Only the display scale is shared: 1000-scale for chances and vendor mods (`(value / 10).toFixed(2)%`, behavior reference `git show v2.2-client:src/components/StatsPanel.vue:166`); perception, search and armor class are plain integers. Put one tested `formatPermille` in `src/stats/format.ts` |
| Vendor buy and sell price with rapport | `computeSellValue` in `helpers/economy.ts:10-15` (imports `./events`, which imports `spacetimedb/server`); buy math inline `items.ts:124-137`; sell math inline in `sell_item` (167-177), `sell_all_junk` (228-232) and three `intent.ts` sites; perk lookup `getPerkBonusByField`, `helpers/renown.ts:365-389` (that file imports LLM and queue helpers) | `economy.ts`: yes. `renown.ts`: yes | New `data/vendor_pricing.ts`: `computeSellValue` (re-exported from `helpers/economy.ts` so `index.ts:198` still imports it), `sellPayout(vendorValue, qty, perkSellPct, vendorSellMod)`, `buyPrice(listPrice, perkDiscountPct, vendorBuyMod)` (perk capped at 50, minimum 1, then `(1000 - mod)/1000`), `rapport(...)`. New `data/perk_rules.ts`: `perkBonusByField(perkKeys, field, level)` extracted from `getPerkBonusByField` (which then delegates), `perkDisplayName(perkKey)` (Q7). The client passes the percent in; sell-all-junk preview must sum per-instance payouts (the server rounds per instance) |
| Craft quality from material, and the hint | `materialTierToCraftQuality`, `CRAFT_QUALITY_LEVELS`, `AFFIX_SLOTS_BY_QUALITY`, `ESSENCE_QUALITY_GATE`, `ESSENCE_MAGNITUDE`, `getModifierMagnitude`, `MATERIAL_DEFS`, `CRAFTING_MODIFIER_DEFS` already live in `data/crafting_rules.ts` (zero imports) [VERIFIED: file read]. The recipe-to-quality lookup (first material name -> key -> `MATERIAL_DEFS` tier) is inline in `craft_recipe` (items_crafting.ts:165-171) | no | Add to `crafting_rules.ts`: `itemKeyFromName(name)` (the `toLowerCase().replace(/\s+/g,'_')` used 6 times), `craftQualityForMaterialName(name)` (craft_recipe calls it), `nextCraftQuality(quality)`, `isGearRecipe(recipe)` (`recipeType && recipeType !== 'consumable'`, inline at items_crafting.ts:45, 162). No `craftQualityOdds`: the owner chose the single deterministic result |
| Usable-by-you | Inline in `equip_item` (items.ts:453-485); `isClassAllowed` in `helpers/character.ts:156-165` (file imports server modules); `normalizeClassName` already in `data/class_stats.ts` | `character.ts`: yes | New `data/item_usability.ts`: `isClassAllowed` (moved; `helpers/character.ts` re-exports), `canEquipItem(template, character)` returning `{ ok: true } | { ok: false, reason }` with reason codes mapped to the existing server messages; `equip_item` calls it. Rule: stackable cannot equip; slot must be an equipment slot; if the character has `weaponProficiencies` or `armorProficiencies`, mainHand/offHand with a `weaponType` needs it in the comma list and head/chest/legs/boots/hands/wrists/belt with an `armorType` needs it in `armorProficiencies`; otherwise the legacy `allowedClasses` check. Neck, earrings and cloak are never checked. Level is NOT part of the server rule (Open Question 4) |
| Faction tier boundaries | `FACTION_STANDING_THRESHOLDS` in `data/mechanical_vocabulary.ts:601-610` (import-free). The only tier logic is client-side `standingLabel` in `src/input/infoCommands.ts:18-28` | no | Add `factionTier(standing)` to `data/faction_rules.ts` implementing the UI-SPEC rule (>= for positive thresholds, <= for negative); re-point `standingLabel` at it (Open Question 5) |
| Inventory capacity | `MAX_INVENTORY_SLOTS = 50` in `helpers/items.ts:390` (imports server) | yes | New `data/inventory_rules.ts`: `MAX_INVENTORY_SLOTS`, `backpackSlotCount(rows)` (non-equipped instances, a stack counts once); `helpers/items.ts` re-exports so `index.ts` and reducers are unchanged |

Existing pure data already usable as is: `RENOWN_RANKS`, `calculateRankFromPoints`, `RENOWN_PERK_POOLS` (`data/renown_data.ts`), `xpRequiredForLevel` and `MAX_LEVEL` (`data/xp.ts`, plus `src/rails/xp.ts`), `EQUIPMENT_SLOTS` (array, `mechanical_vocabulary.ts:215-220`; NOT the Set of the same name in `helpers/items.ts:15`; add a parity test that the 12 members match), `CRAFT_QUALITIES`, `QUALITY_TIERS`.

### Q5. Client data: what is bound, what needs a subscription

Already bound in `createGameData` (read as `game.*`) [VERIFIED: src/game/gameData.ts:90-133, 168-190, 380-391, 700-742]:

| Need | Binding | Scope |
|------|---------|-------|
| Active character (gold, level, xp, base stats, derived columns, `vendorBuyMod`/`SellMod`, proficiencies, `boundLocationId`, `locationId`, `pendingLevels`, `race`, `className`) | `game.character` (from the session) | by owner user |
| Locations (name, `craftingAvailable`), regions | `game.locations`, `game.regions` | once |
| NPCs here (vendors: `npcType === 'vendor'`, `greeting`, `factionId`) | `game.npcsHere` | by location |
| Factions, standings | `game.factions` (whole table), `game.factionStandings` (view `my_faction_standings`) | once |
| Renown, passive perks | `game.renown`, `game.renownPerks` | by character |
| Active (ability) renown perks | `game.abilities` filtered `source === 'Renown'` | by character |
| Feed for the notice line | `game.feed.entries` | in memory |

NOT bound and needed (all through the new hub; SQL via `toSql(tables.x.where(...))` exactly like `src/game/queries.ts`; every keyed binding passes a client filter equal to its query because the SDK cache is shared per table):

| Data | Table or view | Subscription shape | Key |
|------|---------------|--------------------|-----|
| Own items | `item_instance` (public, index `by_owner`) | `WHERE owner_character_id = :id` | active character id |
| Affixes | `item_affix` (public, index `by_instance`) | OR chain `item_instance_id = a OR ...` | ids of owned instances with `qualityTier != null` or `craftQuality != null` (affixes exist only on rolled or crafted gear), plus every equipped instance |
| Templates | `item_template` (public) | OR chain on `id` | union of owned `templateId`s, open vendor's stock `itemTemplateId`s, known recipes' output and requirement ids, the last-sale `templateId`. Never subscribe the whole table (queries.ts rule) |
| Vendor stock | `vendor_inventory` (public, index `by_vendor`) | `WHERE npc_id = :npcId` | the open vendor's id (null when no vendor screen is open) |
| Known recipes | `recipe_discovered` (public, index `by_character`) | `WHERE character_id = :id` | active character id |
| Recipe definitions | `recipe_template` (public) | OR chain on `id` | the discovered `recipeTemplateId`s |
| Pending perk choices | `pending_renown_perk` (public, index `by_character`) | `WHERE character_id = :id` | active character id |
| Last sale | view `my_vendor_buyback` (NEW) | `toSql(tables.myVendorBuyback)` | static |

Notes: the item and affix tables are public, so any client can already read any inventory; the filters scope the client and are not access control (known gap, not widened). Re-subscribing when a key changes keeps the old rows visible until the new binding applies (`createKeyed`, default swap). The OR-chain size for affixes is bounded by the rolled-instance rule; there is no measured limit on chain length [ASSUMED] (Assumptions A2). The hub also needs its own `LedgerReducers` type (the 12 reducers above) and `LedgerConn`, supplied through a new optional `ledger?:` factory on the session deps and a `LEDGER_KEY` provided in `App.vue`, with an inert default so bare mounts and the Phase 45 shell tests keep working [VERIFIED: pattern at src/session/useSession.ts:85, 150-154, 404-417 and src/App.vue:19-21 for `creation`].

### Q6. Screen shell integration (O5) and navigation

- **Registry and renderer.** `SCREENS` (src/screens/screens.ts:36-48) maps ids `map, bag, stats, craft, social, events, vendor` to bodies; `AppFrame.vue` mounts `<component :is="activeDef.component" />` inside `Drawer` (line 133-135, `:key="activeDef.id"`) or `Sheet` (192-194). It passes no props and fills no `#meta` slot; both shells already support `#meta`.
- **Header meta (slots used/cap, gold, station tag, vendor gold).** Add an optional `meta?: Component` to `ScreenDef` and render it in `#meta` in both branches of `AppFrame`; the meta components read `game` and the ledger hub through injection. Title change: the `vendor` entry's `title` becomes `Trade` (its `label` stays `Vendor`; `MoreSheet.vue:11-16` hard-codes `Vendor`, A6).
- **Opening the vendor for an NPC.** Today `NearbyList.vue:92-95,161-171` calls `consoleApi.trade()` with no argument and `useConsole.ts:437-441` does `frame.closeScreen(); frame.openScreen('vendor')`; `FrameControls.openScreen` takes only an id (context.ts:201-207). Recommended: `ConsoleApi.trade(npc?: { id: bigint; name: string })`, `FrameControls.openScreen(id, args?: { npcId?: bigint })` plus a readonly `screenArgs` ref, built in `AppFrame` (frameControls, lines 45-56, and `createInertFrame`), cleared on close and by `openFromMore`. NearbyList passes `{ id: row.id, name: row.name }` (the row id is the NPC id, rails/nearby.ts:19-22).
- **Same-key remount trap.** `trade()` closes and reopens in one tick and the drawer has a fixed `:key`, so a second Trade on another NPC while the vendor drawer is open does NOT remount `VendorScreen`; it must `watch(screenArgs)` (and the keyed vendor-stock binding must follow the target).
- **More with no NPC.** `openFromMore('vendor')` carries no args: exactly one `npcType === 'vendor'` NPC in `game.npcsHere` -> that vendor; several -> the `Vendors here` list; none -> `EmptyState` `No vendor here.` (UI-SPEC copy).
- **Which screen each entry opens** [VERIFIED: frame/tabs.ts:19-47, MoreSheet.vue:11-16, screens.ts]: Bag tab -> `bag` (Inventory); Map tab -> `map`; Party tab -> `social`; More tab -> the More sheet, whose rows open `stats`, `craft`, `events`, `vendor` via `openFromMore`; desktop header buttons open `bag`, `stats`, `craft` (and map, social, events); `vendor` has no header button. `tabForScreen` returns More for `stats`, `craft`, `events`, `vendor`, `encounter`.
- **Combat.** `useScreens({ locked })` already closes any non-More screen when combat starts, so no new combat rule is needed (frame/useScreens.ts).
- **Vendor out of reach.** `game.npcsHere` is keyed by the character's location, so a traveled-away vendor disappears from it; snapshot `{ id, name, greeting, factionId, locationId }` at open time and derive "no longer nearby" from `npcsHere` no longer containing the id.

### Q7. Perk display names (O6)

- **What is stored.** `renown_perk` holds `perkKey` only [VERIFIED: tables.ts:1513-1526]. `chooseRenownPerkLogic` writes passives as `renown_rank${rank}_${name.toLowerCase().replace(/[^a-z0-9]+/g,'_')}` (renown_perk.ts:74) and ACTIVE perks not to `renown_perk` at all but to `ability_template` with `source: 'Renown'` and `abilityKey = renown_rank${rank}_${sanitized}` (47-69). Pending offers (`pending_renown_perk`) carry the exact `name`, `description`, `kind`, `resourceCost`, `resourceType`, `cooldownSeconds`.
- **Recommendation (no schema change):** owned perks = `game.renownPerks` (passives) plus `game.abilities` where `source === 'Renown'` (actives, exact `name`). New `perkDisplayName(perkKey)` in `data/perk_rules.ts`: (1) exact `RENOWN_PERK_POOLS` key match -> pool name (legacy `choose_perk` keys); (2) strip `renown_rank{N}_` and match the sanitized name of a pool entry of rank N -> pool name; (3) otherwise humanize (underscores to spaces, title case). LLM-generated passive names lose punctuation (`Warrior's Edge` -> `Warrior S Edge`); that is acceptable and flagged. A server-side alternative (an optional `perkName` column written at choose time) is an additive but schema-changing edit; do not take it unless the owner wants exact names (Open Question 6).
- **Finding to report to the owner:** `getPerkBonusByField`, `calculatePerkBonuses` and `getPerkProcs` look perks up with `p.key === perkRow.perkKey` (helpers/renown.ts:325, 355, 371-376), but new-path keys carry the `renown_rank{N}_` prefix, so passives chosen through `choose_renown_perk` never apply (including `vendorBuyDiscount` and `vendorSellBonus`). Not exercised by a test; verified by code read. Not Phase 50 scope; the rapport suffix "and renown" will therefore rarely show, and the client must compute the perk percent with the same lookup so the screen matches the server.

### Q8. Notice-line event kinds (O7)

- **Source.** `game.feed.entries` is a `shallowRef` of `FeedEntry` (`key`, `source`, `id`, `kind`, `message`, `characterId`, `createdAtMicros`, `segments`); private rows are accepted only for the active character [VERIFIED: console/feedStore.ts:71-91, 125-145]. Entries carry server time only, so "arrived after the screen opened" is implemented as a snapshot of the entry keys at mount, then the newest entry with `source === 'private'` whose key is not in the snapshot and whose kind is mirrored.
- **Kinds the Phase 50 reducers write:** `system` (every `fail` refusal and informational line, `research_recipes`, `learn_recipe_scroll`, renown choice lines), `reward` (buy, sell, sell all junk, craft, salvage yields), `heal` (`use_item` effects). **Mirror exactly `system`, `reward`, `heal`.** Never mirror `narrative`, `quest`, `faction`, `combat`, `ability`, `buff`, `debuff`, chat kinds or `presence`. The server does not distinguish a refusal from an info line (both `system`), so the error icon (`PhWarningCircle`) can only mark client rejections (the promise rejects); server `system` lines get `PhInfo`, `reward` and `heal` get `PhCheckCircle` (small deviation from the UI-SPEC color table, Open Question 7). Text goes through `cleanServerText`, as a text node, with `role="status"`.

### Q9. Character stats: base or total (O8)

**Base.** `recomputeCharacterDerived` builds `totalStats = character.str + gear.str + effects` (helpers/character.ts:70-76) and writes only the derived columns back (`...character` keeps `str/dex/cha/wis/int` untouched, 122-153). So `character.str` etc. are base (class pair, race bonus at finalize, level-ups), and `gear = sum of equipped instances' sumItemStats` (template bonus + affix magnitudes; the same sum `getEquippedBonuses` computes). The derived columns (`hitChance`, `dodgeChance`, crits, `perception`, `search`, `ccPower`, `armorClass`) and `vendorBuyMod`/`vendorSellMod` are TOTALS (gear and temporary `*_bonus` effects, plus racial bonuses for AC and some chances; AC also starts at 2). Live check: the local character has leather chest, legs, boots worth 3+2+2 AC and `armor_class = 9 = 2 + 7` [VERIFIED: `spacetime sql` on `item_template` ids 4, 5, 6 and `character`]. Therefore the Stats bars use `base = character.str`, `gear = sum over equipped`, `total = base + gear`; the Gear totals AC row reads `character.armorClass` (it already includes buffs and racial bonus); temporary stat buffs are not in `total` (note in the screen's accessible text only if the planner wants parity).

### Q10. Test blast radius (Phase 45, 47, 48 tests)

| Existing test | Lines | Why it breaks | Change |
|---------------|-------|---------------|--------|
| `src/screens/screens.test.ts` | 8-14 (`COPY`), 33-44 (shell loop), 26-30 | Four placeholders are replaced; the loop mounts every `SCREENS` component bare and expects `This screen is still being built.` plus a hidden svg | Limit the placeholder loop to map, social, events; assert `getScreen('vendor').title === 'Trade'`; give each ledger screen its own test |
| `src/frame/AppFrame.screens.test.ts` | 105-112 (`HEADER_CASES` copy for bag, stats, craft), 255-270 (More -> Vendor) | Empty-state copy (`Your bag is empty.`) and the vendor title, close label (`Close Vendor` -> `Close Trade`) and `No vendor nearby.` change; these run with the inert game, so each screen's no-character state needs a stable line (keep the old title lines, or update the constants) | Update constants; `rows` expectation (line 252) stays (A6) |
| `src/frame/frameControls.test.ts` | ~51, 104-108 | `openScreen('bag')` now mounts the real Inventory screen | Inert ledger default must render without a provider; `h4` stays `Inventory` |
| `src/console/useConsole.test.ts` | 839-847, ~916 | `trade()` now takes the NPC and passes args to `openScreen` | Update expectations |
| `src/rails/ContextContent.test.ts` | 212-219 | `trade` click now passes the row | Assert `{ id: 2n, name: 'Marta' }` |
| `src/frame/useScreens.test.ts` | ~127 | Only if `open`/`openFromMore` signatures change (additive optional arg is safe) | likely none |
| `src/session/useSession.test.ts`, `src/App.test.ts` | factory and `fakeSession` | New optional `ledger` factory and `LEDGER_KEY` | Additive; `fakeSession` gains `ledger` |
| `src/game/gameData.test.ts`, `queries.test.ts` | `queries` literal at gameData.test.ts:30-76 | Only if the ledger queries were added to `GameQueries` | Unaffected with the recommended separate hub |
| `src/frame/AppFrame.combat.test.ts`, `EncounterPanel` | combat lock, More rows | None expected if `AppFrame` edits are limited to the meta slot and args | Run as regression |
| `src/input/infoCommands.test.ts` | 14-31 | Re-pointing `standingLabel` at `factionTier`: every listed row (100, 75, 50, 25, 0, 10, -25, -50, -100, -500, 500) still passes; only -1..-24 and -26..-99 change | Add rows for the changed bands |
| `src/gameDataAlias.test.ts` | extend | New modules must be import-free | Add specifier tests |
| Server: `helpers/examine.test.ts` | whole | Refactor to `sumItemStats` | must stay green unchanged |
| Server: `reducers/intent.test.ts` | sell sections | They mirror logic inline, not the real handler | unaffected; add real-handler cases via `capturedReducer('submit_intent')` (precedent `character_info_intent.test.ts`) |
| Auto-scanned guards | `designContract`, `colors.guard`, `tokens.client` (pin 23), `scrollbars` | `listClientFiles` scans every new `.vue` and `.ts` under `src/` | New files must comply on first run (Pitfall 11) |

### Q11. The parallel "Ripple" rename

As read in this session the rename is already committed and the working tree is clean: `a7bdf561` (server: `reducers/intent.ts`, `helpers/world_gen.ts`, `llm_apply.ts`, `travel.ts`, `llm_cutover.test.ts`), `4269d5a1` (client: `src/console/lines.ts`, `FeedLine.vue`, tests, `AppFrame.populated.test.ts`), `7aa34027` (guard `spacetimedb/src/data/no_ripple_word.test.ts`, which fails on the word in any case in non-test source under `spacetimedb/src` and `src`, bindings excluded) [VERIFIED: `git show --stat`, `git status`]. Overlap with Phase 50: `reducers/intent.ts` (one line changed there; Phase 50 edits the sell paths in the same file, so re-read it fresh before editing), and `AppFrame.populated.test.ts` only if the plan touches it. `src/console/lines.ts` and `FeedLine.vue` are not Phase 50 files (the notice line renders its own text). Constraint for new code: the banned word must not appear in any new source file, comment, CSS class or string. If the other agent has further uncommitted edits by execution time, check `git status` before touching `intent.ts`, `AppFrame.vue`, `useConsole.ts` or `src/game/*`. No schema change is involved, so a bindings regeneration for Phase 50 cannot conflict with it.

## Architecture Patterns

### System Architecture Diagram

```
 SpacetimeDB
  public tables (filtered subscriptions, scoping only)
    item_instance WHERE owner_character_id = me          item_affix  OR(item_instance_id = ...)   (rolled instances)
    item_template OR(id = ...)                           vendor_inventory WHERE npc_id = open vendor
    recipe_discovered WHERE character_id = me            recipe_template OR(id = ...)
    pending_renown_perk WHERE character_id = me
  views:  my_faction_standings (already bound)   my_vendor_buyback (NEW, per-sender, from private vendor_buyback)
  already bound by the game hub: character, locations, npcsHere, factions, renown, renownPerks, abilities, feed
          |
          v
   LedgerData hub (src/ledger/ledgerData.ts, session-owned, inert default via LEDGER_KEY)
     bindings + LedgerReducers (equipItem ... buybackLastSale, object args)
          |
          v   pure models (no Vue):  itemModel, compare, backpack, statsModel, vendorModel, craftingModel
          |        each calls @game-data helpers:  item_stats, item_usability, vendor_pricing, perk_rules,
          |        faction_rules, crafting_rules, inventory_rules, item_rules, renown_data, xp
          v
   AppFrame ── SCREENS[bag|stats|craft|vendor] ──> Drawer (desktop) | Sheet (mobile), #meta slot, screenArgs (vendor npc)
          |
          v   click -> reducer promise (button inert until settled; rejection -> "Couldn't send that. Try again.")
   Server reducers (items.ts, items_crafting.ts, renown.ts, NEW buyback_last_sale)
     mutate rows + append private events  ──> subscriptions update rows ──> screens re-render (no optimistic state)
     private event rows (system | reward | heal) ──> game.feed.entries ──> NoticeLine (arrived after open)
```

### Recommended Project Structure
```
spacetimedb/src/
├── data/item_stats.ts  item_usability.ts  vendor_pricing.ts  perk_rules.ts  inventory_rules.ts  item_rules.ts   # NEW, import-free, each with *.test.ts
├── data/faction_rules.ts  crafting_rules.ts                  # extended (factionTier; quality lookup, itemKeyFromName, isGearRecipe)
├── helpers/vendor_sale.ts                                     # NEW: sellInstanceToVendor + affix snapshot + restoreSnapshot
├── schema/tables.ts                                           # + VendorBuyback
├── views/vendor_buyback.ts  views/types.ts  views/index.ts    # NEW view, ViewDeps field
├── reducers/items.ts  intent.ts  characters.ts                # sell_item, buyback_last_sale, NL single sell, delete_character cleanup
└── reducers/vendor_buyback.test.ts  views/vendor_buyback.test.ts
src/
├── ledger/    ledgerContext.ts (LEDGER_KEY + inert)  ledgerData.ts  queries.ts  itemModel.ts  compare.ts  NoticeLine.vue
│              GoldAmount.vue  ItemTile.vue  FilterChips.vue  SegTabs.vue  InlineConfirm.vue  *.test.ts
├── inventory/ stats/ vendor/ crafting/    # one folder per screen: model .ts + components + tests
└── screens/screens.ts  frame/AppFrame.vue  console/useConsole.ts  rails/NearbyList.vue  game/context.ts  # small edits (meta, screenArgs, trade(npc))
```

### Pattern 1: one import-free helper, two callers
**What:** a `data/` function used by the server reducer and by the client model, with a differential test against the real handler.
**Example (pure sum, extracted from examine.ts:161-184 and generalized):**
```typescript
// spacetimedb/src/data/item_stats.ts  (no imports)
export const ITEM_STAT_KEYS = ['strBonus','dexBonus','intBonus','wisBonus','chaBonus','hpBonus','manaBonus',
  'armorClassBonus','magicResistanceBonus','lifeOnHit','cooldownReduction','manaRegen','weaponBaseDamage','weaponDps'] as const;
export type ItemStatKey = (typeof ITEM_STAT_KEYS)[number];
export type ItemStatTotals = Record<ItemStatKey, bigint>;

export function sumItemStats(
  template: Readonly<Record<string, unknown>>,
  affixes: ReadonlyArray<{ statKey: string; magnitude: bigint }>,
): ItemStatTotals {
  const big = (v: unknown): bigint => (typeof v === 'bigint' ? v : 0n);
  const out = {} as ItemStatTotals;
  for (const key of ITEM_STAT_KEYS) out[key] = big(template[key]);
  for (const affix of affixes) {
    if ((ITEM_STAT_KEYS as readonly string[]).indexOf(affix.statKey) !== -1) out[affix.statKey as ItemStatKey] += affix.magnitude;
  }
  return out;
}
```

### Pattern 2: session-owned hub with keyed bindings
**What:** the Phase 49 `creation` factory pattern: `createLedgerData(deps, input)` with its own `LedgerConn`, queries file and effect scope; keyed bindings via `createKeyed`/`keyedIdList` (copy the private `keyedTable`/`keyedIdList` helpers from gameData.ts:240-270 rather than exporting them, to avoid editing that file).

### Pattern 3: header meta and screen args in the frame
`ScreenDef.meta?: Component` rendered in `<template #meta>`; `FrameControls.screenArgs` set by `openScreen(id, args)`, cleared by `closeScreen` and `openFromMore`.

### Pattern 4: notice line over the feed
```typescript
const MIRRORED_KINDS = new Set(['system', 'reward', 'heal']);
const seenAtOpen = new Set(game.feed.entries.value.map((e) => e.key));          // snapshot at mount
const notice = computed(() => {
  const list = game.feed.entries.value;
  for (let i = list.length - 1; i >= 0; i -= 1) {                               // no .at(): project guard
    const e = list[i];
    if (e.source === 'private' && MIRRORED_KINDS.has(e.kind) && !seenAtOpen.has(e.key)) return e;
  }
  return null;
});
```

### Anti-Patterns to Avoid
- **Copying a server constant to the client** (capacity 50, tier edges, price math, quality rule). Import from `@game-data`; a test pins each.
- **Optimistic UI** (CLAUDE.md): never adjust gold, bag or recipes locally; rows drive every update.
- **Gating Equip on level** in the client when the server does not (Open Question 4).
- **Subscribing whole public tables** (`item_template`, `recipe_template`, `item_affix`).
- **Letting a refusal go invisible**: the drawer covers the feed, so every action surface shows the notice line.
- **Keying client state on a sold instance id** (buy-back restores a new instance).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-item stat totals and comparison inputs | A client re-sum of template and affix fields | `sumItemStats` (`@game-data/item_stats`) | `getEquippedBonuses`, examine and the screen would drift |
| Buy and sell price, rapport | Percent math in a component | `@game-data/vendor_pricing` | Per-instance integer rounding and perk caps must match the server |
| Class and proficiency check for Equip and "Usable by you" | A second rule in `vendorModel.ts` | `canEquipItem` (`@game-data/item_usability`) | The server's refusal strings come from the same function |
| Craft quality and the "what would raise it" hint | A tier table in the crafting model | `craftQualityForMaterialName`, `nextCraftQuality` | `craft_recipe` uses the same call |
| Faction tier labels | A third copy of the thresholds | `factionTier` (`@game-data/faction_rules`) | `/faction` and the screen must agree |
| Filtered subscriptions and swap-on-applied | New subscription plumbing | `bindTable`, `createKeyed`, `idListKey`, `toSql` | Shared-cache and reconnect behavior already solved |
| Percent display scale | `/100` or `/1000` guesses | One tested `formatPermille` (value / 10, 2 decimals) | Old StatsPanel and server comments agree on the 1000-scale |
| Server text cleaning | Regex in the notice line | `cleanServerText` | Existing, tested |
| Dialog focus, Esc, trap | A new trap | Drawer and Sheet as built; inner Esc handlers call `preventDefault()` | The shells check `defaultPrevented` |
| Gold in transactions | Client arithmetic for refund or price | The server's `price` on the buy-back row | A client number could be wrong or forged |

**Key insight:** every Phase 50 number the player reads (price, delta, payout, tier, quality) already has a server computation; the work is to expose that computation as one pure function and prove the two callers agree.

## Common Pitfalls

### Pitfall 1: the sell paths are duplicated, so a guard in `sell_item` is a bypass
**What goes wrong:** `submit_intent`'s `sell`, `sell N` and `sell junk` re-implement the sale (intent.ts:955-1110), so the quest refusal and the buy-back record in `sell_item` alone would miss text commands.
**How to avoid:** one shared server helper for a single sale; refusal and record live there; test through `capturedReducer('submit_intent')`.
**Warning signs:** a quest-slot template sells via `sell <name>` in a real-handler test.

### Pitfall 2: affixes are deleted before the instance, and magnitudes are bigint
**What goes wrong:** snapshotting after items.ts:183-186 stores nothing; `JSON.stringify` on an `i64` throws.
**How to avoid:** snapshot first; store magnitudes as decimal strings; a restore test compares affix rows before the sale and after the buy-back.

### Pitfall 3: `craft_recipe` refusals commit after inputs are consumed
**What goes wrong:** `failItem` returns, the transaction commits, and materials are gone (items_crafting.ts:152-157 run before the refusals at 192-194, 196, 215, 228-230). A too-weak essence, a missing reagent, or an essence with no reagent costs the player the materials and yields an unqualified output.
**How to avoid:** the screen must disable Craft (with the UI-SPEC reason) for every one of those states: essence not in `ESSENCE_QUALITY_GATE[key]` for the quality, essence without at least one valid reagent, reagent count above what is on hand. Add a server pin test documenting the behavior. A server reorder (validate before mutate) is a candidate hardening task for the owner (Open Question 10), not default scope.

### Pitfall 4: `equip_item` has no level gate; `unequip_item`, `craft_recipe` and `salvage_item` have no bag-space gate
**What goes wrong:** the UI-SPEC reasons `Requires level {n}.` and `Your backpack is full.` (Unequip, Craft) are client-only; a client that blocks Equip on level disagrees with the server's world-tier rule, and a text command can still overfill the bag.
**How to avoid:** follow the server for Equip (show `Requires Lv n` as information); keep the bag-full gates as client conveniences (stated as such in the plan).

### Pitfall 5: the Drawer does not remount on a second Trade
**What goes wrong:** `:key="activeDef.id"` is constant, so Trade on another NPC leaves `VendorScreen` mounted with stale state.
**How to avoid:** watch `screenArgs`; reset selection, filters, confirmation and the keyed vendor binding when the target changes.

### Pitfall 6: base stats vs totals
**What goes wrong:** treating `character.armorClass` as base, or adding gear to it, double counts; showing `character.str` as the total hides gear.
**How to avoid:** Q9: stats are base, derived columns are totals; test base/gear split against `getEquippedBonuses` on one fixture.

### Pitfall 7: `use_item` consumes items that do nothing
**What goes wrong:** six of the ten handled names consume the item and print `nothing happens`; unknown names answer `Item cannot be used`.
**How to avoid:** export the effectful key set to `data/item_rules.ts` (`USABLE_ITEM_KEYS`) and show Use only for those keys (UI-SPEC "Food or consumable: Use" is otherwise a trap). No consumable template exists in the local database today.

### Pitfall 8: vendor listings lose quality
**What goes wrong:** `sell_item` lists with `qualityTier`, but `buy_item` ignores it, so the For-sale row cannot honestly show the listing's tier.
**How to avoid:** color For-sale rows by `template.rarity`; inventory instances use `instance.qualityTier ?? template.rarity` (matches examine). Out-of-scope server limitation, noted for the owner.

### Pitfall 9: perk keys and effects (Q7)
Perk names need a mapping function and passives chosen through the new path have no mechanical effect today; do not promise a vendor discount in copy that the server will not apply. Compute the perk percent with the shared function so the screen equals the server.

### Pitfall 10: the client binding order
`tables.myVendorBuyback` does not exist until the bindings are regenerated after the local publish; `queries.ts` and the hub typecheck only afterwards. Plan the publish and `pnpm spacetime:generate -y` before the client tasks, and never edit `src/module_bindings`.

### Pitfall 11: design guards run on first mount of new files
`designContract` (type scale 10/12/14/20, weights 400/500, spacing 0/4/8/16/24/32/48/64 for padding, margin and gap, `h4`/`h6` only, Phosphor only, no inline svg, no `v-html`), `colors.guard` (no literal color, including inside `color-mix`), `tokens.client` (23 tokens, every `var(--x)` defined), `scrollbars` (no literal scrollbar colors). Use only the existing `--color-rarity-*`, `--color-craft-*`, `--color-con-*`, `--color-line-*` tokens; structural px literals are allowed because the spacing guard checks padding, margin and gap only.

### Pitfall 12: salvage of an equipped item is two calls
`unequip_item` then `salvage_item`; whether the local cache already shows the item unequipped when the first promise settles is not verified [ASSUMED]. Send the second call after the first settles and treat the server's `Unequip item first` refusal as harmless.

### Pitfall 13: ids are not ordered
Local instance ids jump (`4097`, `4098`; CLAUDE.md "gaps are normal"). Sort bag items by category, rarity, name, then id only as the final tie-break; never infer recency from an id (the notice line uses a key snapshot, not "highest id").

## Code Examples

### Ledger subscription SQL (typed, filtered)
```typescript
// src/ledger/queries.ts   (same style as src/game/queries.ts)
import { toSql } from 'spacetimedb';
import { tables } from '../module_bindings';
const orChain = <T>(ids: readonly bigint[], eq: (r: T, id: bigint) => any) => (r: T) => ids.map((id) => eq(r, id)).reduce((a, b) => a.or(b));
export const ledgerQueries = () => ({
  itemInstances: (characterId: bigint) => toSql(tables.itemInstance.where((r) => r.ownerCharacterId.eq(characterId))),
  itemAffixes: (ids: readonly bigint[]) => toSql(tables.itemAffix.where((r) => ids.map((id) => r.itemInstanceId.eq(id)).reduce((a, b) => a.or(b)))),
  itemTemplates: (ids: readonly bigint[]) => toSql(tables.itemTemplate.where((r) => ids.map((id) => r.id.eq(id)).reduce((a, b) => a.or(b)))),
  vendorStock: (npcId: bigint) => toSql(tables.vendorInventory.where((r) => r.npcId.eq(npcId))),
  recipesKnown: (characterId: bigint) => toSql(tables.recipeDiscovered.where((r) => r.characterId.eq(characterId))),
  recipeTemplates: (ids: readonly bigint[]) => toSql(tables.recipeTemplate.where((r) => ids.map((id) => r.id.eq(id)).reduce((a, b) => a.or(b)))),
  pendingPerks: (characterId: bigint) => toSql(tables.pendingRenownPerk.where((r) => r.characterId.eq(characterId))),
  myVendorBuyback: toSql(tables.myVendorBuyback),   // exists only after the bindings are regenerated
});
```
(Remove the unused `orChain` helper when copying; an empty id list must be refused like `requireIds` in queries.ts:62-64.)

### Shared pricing (extracted; both callers)
```typescript
// spacetimedb/src/data/vendor_pricing.ts  (no imports)
export function computeSellValue(baseValue: bigint, vendorSellMod: bigint): bigint {      // moved from helpers/economy.ts:10-15
  return vendorSellMod > 0n && baseValue > 0n ? (baseValue * (1000n + vendorSellMod)) / 1000n : baseValue;
}
export function sellPayout(vendorValue: bigint, quantity: bigint, perkSellPct: number, vendorSellMod: bigint): bigint {
  let base = vendorValue * quantity;
  if (perkSellPct > 0 && base > 0n) base = (base * BigInt(100 + Math.trunc(perkSellPct))) / 100n;   // BigInt(non-integer) throws
  return computeSellValue(base, vendorSellMod);
}
export function buyPrice(listPrice: bigint, perkDiscountPct: number, vendorBuyMod: bigint): bigint {
  let price = listPrice;
  if (perkDiscountPct > 0) { price = (listPrice * BigInt(100 - Math.min(Math.trunc(perkDiscountPct), 50))) / 100n; if (price < 1n) price = 1n; }
  if (vendorBuyMod > 0n) { price = (price * (1000n - vendorBuyMod)) / 1000n; if (price < 1n) price = 1n; }
  return price;
}
```

### Real-handler server test skeleton (harness reuse)
```typescript
// spacetimedb/src/reducers/vendor_buyback.test.ts  (pattern: creation_finalize.test.ts)
vi.mock('spacetimedb/server', async () => (await import('../helpers/schema_recorder')).createRecordingServerMock());
beforeAll(async () => { await import('../index'); sellItem = capturedReducer('sell_item')!; buyback = capturedReducer('buyback_last_sale')!; sellAllJunk = capturedReducer('sell_all_junk')!; }, 120_000);
const ctx = createMockCtx({ seed, sender: alice, timestampMicros: T0, strict: true });   // strict: unknown table or accessor throws
// seed: player, character (gold, locationId), item_template, item_instance (+ item_affix), npc (vendor), vendor_inventory: []
sellItem(ctx, { characterId: 1n, itemInstanceId: 7n, npcId: 3n });
expect(rows(ctx, 'vendor_buyback')).toHaveLength(1);
buyback(ctx, { characterId: 1n });
expect(rows(ctx, 'vendor_buyback')).toHaveLength(0);   // item, affixes and gold restored
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| v2.2 client panels (`InventoryPanel`, `VendorPanel`, `CraftingPanel`, `StatsPanel` at tag `v2.2-client`) | Ledger drawers and sheets on Phase 45 shells | v3.0 | Old files are a behavior reference only (percent scale, vendor flows) |
| Level-gated equip | World-tier design: any item equippable by proficiency | before Phase 45 (comment at items.ts:454-456) | Client must not add a level gate |
| Seeded recipes, factions, vendor stock | Dynamic world: no seeding | v2.0 | Crafting and Factions are empty until generated |
| Quality odds in the design mock | Single deterministic quality (owner decision) | 2026-10-06 | No odds helper, no probability bar |

**Deprecated/outdated:** `PhAnvil` does not exist in the installed Phosphor package (UI-SPEC uses `PhHammer`); `choose_perk` (legacy, key-based) is not used by the new UI.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The SDK reducer promise settles after (or with) the local cache update, so the second call of "unequip then salvage" sees the item unequipped | Pitfall 12 | A harmless server refusal `Unequip item first` line; the UI skip rule covers it |
| A2 | A subscription OR chain of about 60 terms (rolled instance ids) is accepted | Q5 | Chunk the key or use a per-sender `my_item_affixes` view (Open Question 14) |
| A3 | `slot === 'quest'` is the right quest-item marker for future generated items | Q3, Open Question 13 | The refusal never triggers; marker moves to one helper |
| A4 | Passive perks chosen through `choose_renown_perk` have no mechanical effect (code read only, no test run) | Q7, Pitfall 9 | If wrong, the rapport suffix may show more often; computing the perk percent with the shared function keeps the screen correct either way |
| A5 | Baseline failures to ignore in the full suite are the three named in Phase 49 research (`call_log_report.test.mjs`, `proof_rules.test.mjs`, `measurement.results.test.ts`); not re-run here | Validation Architecture | The gate may need to list different known failures |

## Open Questions (RESOLVED)

1. **Does a restored buy-back item keep its instance id?**
   - What we know: `sell_item` deletes the instance and affixes; an escrow design leaves orphans.
   - What's unclear: whether the owner means "same id" literally.
   - Recommendation: snapshot row, new instance id, identical template, quantity, quality, craft quality, display name, flags and affixes (restore test compares them). Treat "same instance" as same item.
   - RESOLVED: take the recommendation above.

2. **What happens to the resale listing a sale created?**
   - Recommendation: record `listingId` only when that sale inserted the listing, and delete it on buy-back so sell then buy back leaves vendor stock unchanged. A second sale replaces the row but leaves the first item listed (that sale is final).
   - RESOLVED: take the recommendation above.

3. **The natural-language `sell` paths.**
   - What we know: three duplicated implementations in `intent.ts`; none refuses quest items; only the single-item path is a "single Sell".
   - Recommendation: one shared `sellInstanceToVendor` helper for `sell_item` and NL single sell (refuses quest items, records buy-back); NL sell-N and sell-junk skip quest templates and never record. Re-read `intent.ts` fresh (it was edited by the rename).
   - RESOLVED: take the recommendation above.

4. **"Usable by you" and Equip: level or not?**
   - What we know: the server has no level gate (items.ts:454-456); the approved UI-SPEC and CONTEXT include `requiredLevel <= level`.
   - Recommendation: `canEquipItem` returns the class/proficiency result the server enforces plus a separate informational `levelShort` flag. "Usable by you" hides class-unusable rows; level-short items stay visible with `Requires Lv n` in red, and Equip and Buy stay enabled. Ask the owner at UAT; flipping to a hard gate is a one-line change in the model.
   - RESOLVED: take the recommendation above.

5. **Faction tier labels differ between `/faction` and the approved rule.**
   - What we know: `standingLabel` uses "highest threshold reached", so -10 reads Unfriendly, -30 Hostile, -75 Hated; the UI-SPEC rule gives Neutral, Unfriendly, Hostile.
   - Recommendation: implement the UI-SPEC rule once (`factionTier`) and re-point `standingLabel` so the feed and the screen agree; tell the owner the `/faction` negative bands shift by one tier.
   - RESOLVED: take the recommendation above. Tell the owner at UAT that the `/faction` negative bands shift by one tier.

6. **Perk names for LLM-generated passives.**
   - Recommendation: client `perkDisplayName` (pool lookup, then humanize); active perks use `ability_template.name`. Take the optional `perkName` column only if the owner wants exact punctuation.
   - RESOLVED: take the recommendation above. Separately, the owner chose "Todo for later" for the side finding that chosen passive perks never match `RENOWN_PERK_POOLS` keys and have no effect. It is filed as a todo and is NOT fixed in Phase 50.

7. **Notice-line icons for server refusals.**
   - What we know: refusals and info lines are both `system`.
   - Recommendation: `PhWarningCircle` only for client rejections; `PhInfo` for `system`; `PhCheckCircle` for `reward` and `heal`. Record the UI-SPEC deviation in the plan.
   - RESOLVED: take the recommendation above.

8. **Stat totals and temporary buffs.**
   - Recommendation: bars show base + gear; derived rows read stored (buff-inclusive) columns; no extra row.
   - RESOLVED: take the recommendation above.

9. **Mobile Equip and Unequip reasons that the server does not enforce.**
   - Recommendation: keep the bag-full reason as a client convenience (Pitfall 4).
   - RESOLVED: take the recommendation above.

10. **`craft_recipe` commits after consuming inputs.**
    - Recommendation: mandatory client pre-gating plus a pin test now; add a backlog item for validate-before-mutate. Do not widen server scope by default.
   - RESOLVED by the owner (2026-10-06, in chat): "Fix it in Phase 50". Reorder `craft_recipe` to validate before it mutates: every refusal happens before any input is consumed or any output is added. This is a code-only server change with real-handler tests (each refusal leaves the inventory unchanged), published locally with the buy-back work. Client pre-gating stays as well.

11. **Craft quality hint wording.**
    - What we know: quality is a function of the recipe's FIRST material only; reagents never change it; Dented and Mastercraft are unreachable; tiers 1, 2, 3 give Standard, Reinforced, Exquisite.
    - Recommendation: the hint is not actionable inside one recipe, so use `A recipe with a tier {n+1} primary material would make it {NextTier}.`; show no hint at Exquisite (top reachable) or for consumables. This replaces the UI-SPEC example text `Higher-tier {material} would make it {NextTier}.`
   - RESOLVED: take the recommendation above.

12. **Live data for the owner's try-out.**
    - What we know: no recipes, factions or opening vendor stock exist or can be generated by code; the local character is at location 5, the only vendor at location 1; item_affix is empty.
    - Recommendation: unit and component tests use fixtures; list in the plan what the owner needs (travel to Orrin Sill, sell something to create stock, no recipes until a generator exists). Do not seed.
   - RESOLVED: take the recommendation above. The owner-facing try-out list goes in the final plan SUMMARY.

13. **Quest-item marker.** See Q3 and A3; recommendation: `slot === 'quest'` in `data/item_rules.ts`, synthetic-template test, honest note to the owner that no generated item carries it yet.
   - RESOLVED: take the recommendation above.

14. **Affix subscription: OR chain or per-sender view?**
    - Recommendation: OR chain keyed by rolled and equipped instance ids (no new server surface); switch to a `my_item_affixes` view only if A2 fails.
   - RESOLVED: take the recommendation above.

15. **Vendor For-sale rarity.** Recommendation: color by `template.rarity` (Pitfall 8).
   - RESOLVED: take the recommendation above.

16. **Hub placement.** Recommendation: separate session-owned `LedgerData` (Q5), so `gameData.ts`, `context.ts`, `queries.ts` and their fakes are untouched.
   - RESOLVED: take the recommendation above.

17. **Vendor proximity on buy and sell.**
    - What we know: neither `buy_item` nor `sell_item` verifies the NPC is at the character's location (the NL path does); `sell_all_junk` sells anywhere.
    - Recommendation: leave as is (behavior change); the client gates, and buy-back enforces the place rule from the character's own location.
   - RESOLVED: take the recommendation above.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | tests, build | yes | v22.23.2 | none needed |
| pnpm | scripts | yes | 11.23.0 | none needed |
| SpacetimeDB CLI | local publish, generate, read-only `sql` | yes | binary at `%LOCALAPPDATA%\SpacetimeDB\spacetime` (`--break-clients` and `-p` flags present in `publish --help`) | none needed |
| Local SpacetimeDB server | publish, live reads | yes | `/v1/ping` 200 | owner's server; do not start or stop |
| Vite dev server | owner try-out | yes | `http://localhost:5173` 200 | owner's; do not stop |
| Anthropic key (local) | live LLM routes (perk generation, not needed to build) | stored | `admin_llm_status` reads `key_set true, key_length 108` | no paid call is needed for this phase's tests |

**Missing dependencies with no fallback:** none. **Missing dependencies with fallback:** none.

Local data read this session (read-only): 1 character (Elfansworth, level 3, gold 51, location 5, bound location 1, 3 leather pieces and a dagger equipped, 6 other stacks); `item_template` slots are equipment, `junk`, `material` only; `item_affix`, `recipe_template`, `recipe_discovered`, `faction`, `faction_standing`, `vendor_inventory`, `pending_renown_perk`, `renown_perk` are empty; `renown` 11 points rank 1; 2 NPCs (vendor Sabeth Orrowyn and banker, both at location 1, which has `crafting_available true`).

## Validation Architecture

(`workflow.nyquist_validation` is `true` in `.planning/config.json`.)

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 5.0.2 (root: happy-dom per file via `// @vitest-environment happy-dom`; server tests run in node under `spacetimedb/`) |
| Config file | none (root uses `vite.config.ts`, which defines `@game-data`) |
| Quick run (client slice) | `pnpm exec vitest run src/ledger src/inventory src/stats src/vendor src/crafting --maxWorkers=1` |
| Quick run (server slice) | `cd spacetimedb && pnpm exec vitest run src/data/item_stats.test.ts src/data/vendor_pricing.test.ts src/reducers/vendor_buyback.test.ts --maxWorkers=1` |
| Full suite | `pnpm exec vitest run --maxWorkers=1` (root also picks up `spacetimedb/src` tests) plus `pnpm exec vue-tsc -b`; known baseline failures (Phase 49 note, re-check) `scripts/llm/call_log_report.test.mjs`, `scripts/llm/proof_rules.test.mjs`, `spacetimedb/src/helpers/measurement.results.test.ts` |

First import of the server `index.ts` in a real-handler test costs about 4 s; component files run in about 1 s each [CITED: 49-RESEARCH.md].

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| LDG-01 | category rule row by row (quest, junk, gear, food, recipe, material, other), rarity token with unknown = common, icon table, slot labels, bag sort order | unit | `pnpm exec vitest run src/ledger/itemModel.test.ts` | no, Wave 0 |
| LDG-01 | slot count excludes equipped, stack counts once, `Full` at cap, each filter's set, empty tiles only under All; capacity comes from `@game-data` | unit | `pnpm exec vitest run src/inventory/backpack.test.ts` | no, Wave 0 |
| LDG-01 | `MAX_INVENTORY_SLOTS` and `backpackSlotCount` helper; `EQUIPMENT_SLOTS` array equals the server Set | unit (server) | `cd spacetimedb && pnpm exec vitest run src/data/inventory_rules.test.ts` | no, Wave 0 |
| LDG-01 | desktop and mobile inventory render, roving-tabindex grid, tabs (arrows, Home, End), 44px targets, dock open and close with focus return | component | `pnpm exec vitest run src/inventory` | no, Wave 0 |
| LDG-02 | `sumItemStats` incl. affixes and craft-quality implicits; equals the examine output; differential against `getEquippedBonuses` on one fixture | unit (server) | `cd spacetimedb && pnpm exec vitest run src/data/item_stats.test.ts src/helpers/examine.test.ts` | partly (examine exists) |
| LDG-02 | comparison: up for positive, down for negative, none at zero, stat union shows losses, nothing equipped -> all up, no deltas for equipped or non-gear, screen-reader text | unit | `pnpm exec vitest run src/ledger/compare.test.ts` | no, Wave 0 |
| LDG-02 | `canEquipItem` equals the real `equip_item` handler's refusals (class, weapon, armor, stackable, slot); level reported but not a refusal | integration (real handler) | `cd spacetimedb && pnpm exec vitest run src/data/item_usability.test.ts src/reducers/equip_item.test.ts` | no, Wave 0 |
| LDG-02 | inspector actions per item kind, Salvage hidden when not salvageable, common salvages at once, non-common and equipped confirm, equipped flow `unequip_item` then `salvage_item`, `Keep it` sends nothing, Use only for `USABLE_ITEM_KEYS` | component | `pnpm exec vitest run src/inventory/Inspector.test.ts` | no, Wave 0 |
| LDG-03 | bar `scaleMax`, base/gear split vs `getEquippedBonuses`, renown rank, name, progress incl. rank 15, `formatPermille` (150 -> `15.00%`), no Keeper's assessment in source | unit | `pnpm exec vitest run src/stats` | no, Wave 0 |
| LDG-03 | `factionTier` at every edge (100, 75, 50, 25, 24, -24, -25, -49, -50, -99, -100) and `standingLabel` agrees | unit | `cd spacetimedb && pnpm exec vitest run src/data/faction_rules.test.ts` and `pnpm exec vitest run src/input/infoCommands.test.ts` | no / extend |
| LDG-03 | `perkDisplayName` (pool key, prefixed key, humanized), owned perks from `renownPerks` plus Renown abilities, chooser sends `choose_renown_perk({ characterId, perkId })`, inert until chosen, lowest pending rank first | unit + component | `cd spacetimedb && pnpm exec vitest run src/data/perk_rules.test.ts` and `pnpm exec vitest run src/stats/PerkChooser.test.ts` | no, Wave 0 |
| LDG-08 | `buyPrice`, `sellPayout`, `rapport` equal the real `buy_item`, `sell_item`, `sell_all_junk` gold deltas (differential, real handlers) | integration (real handler) | `cd spacetimedb && pnpm exec vitest run src/data/vendor_pricing.test.ts src/reducers/vendor_pricing_parity.test.ts` | no, Wave 0 |
| LDG-08 | usable filter hides rows, All keeps Buy, can't-afford and full-bag reasons, rapport text with U+2212, vendor selection (Nearby id; More with one, several, none), vendor-left state | unit + component | `pnpm exec vitest run src/vendor` | no, Wave 0 |
| LDG-09 | sell then buy back restores item, affixes and gold; a second sale replaces the first; Sell all junk neither records nor changes the row; wrong owner (`Not your character`), not enough gold, wrong place, full bag, nothing to buy back each refuse and leave the row | integration (real handler) | `cd spacetimedb && pnpm exec vitest run src/reducers/vendor_buyback.test.ts` | no, Wave 0 |
| LDG-09 | `vendor_buyback` is not public; `my_vendor_buyback` returns only the sender's active character's row (two owners fixture) | schema + view | `cd spacetimedb && pnpm exec vitest run src/views/vendor_buyback.test.ts` | no, Wave 0 (pattern `views/combat.test.ts`, `schema/llm_privacy.test.ts`) |
| LDG-09 | quest template refused with `Quest items can't be sold.` in `sell_item` and in `submit_intent` `sell`, `sell N`, `sell junk`; instance, gold and buy-back row unchanged | integration (real handler) | `cd spacetimedb && pnpm exec vitest run src/reducers/quest_item_sale.test.ts` | no, Wave 0 |
| LDG-09 | Just sold card renders from the view row only; button states (gold short, wrong place, full bag, pending, offline), `Buy back` object call, focus to heading, junk leaves the card | component | `pnpm exec vitest run src/vendor/JustSold.test.ts` | no, Wave 0 |
| LDG-09 | `delete_character` removes the buy-back row | integration | `cd spacetimedb && pnpm exec vitest run src/reducers/vendor_buyback.test.ts` | no, Wave 0 |
| LDG-10 | have/need uses the true bag count (same in list and detail), craftable rule, only-craftable filter (default off), category mapping with unknown -> All only, row order, empty states | unit | `pnpm exec vitest run src/crafting/craftingModel.test.ts` | no, Wave 0 |
| LDG-11 | `craftQualityForMaterialName` equals the quality the real `craft_recipe` stores (T1, T2, T3, unknown material); `nextCraftQuality`; hint copy; no hint at the top tier or for consumables | integration (real handler) | `cd spacetimedb && pnpm exec vitest run src/data/crafting_rules.test.ts src/reducers/craft_quality.test.ts` | no, Wave 0 |
| LDG-11 | reagent rules: essence gate by quality, slot count by quality, magnitude hint from `getModifierMagnitude`, essence without reagent disables Craft, reagent count cap; Craft sends only set ids; Discover calls `research_recipes`; station reasons | unit + component | `pnpm exec vitest run src/crafting` | no, Wave 0 |
| LDG-11 | server pin: an essence too weak consumes inputs and commits (documents Pitfall 3) | integration (real handler) | `cd spacetimedb && pnpm exec vitest run src/reducers/craft_quality.test.ts` | no, Wave 0 |
| shell | `trade(npc)` passes the NPC; `screenArgs` set and cleared; `watch` follows a second Trade; meta slot renders per screen; title `Trade`; More label stays `Vendor`; each tab and Bag opens the right screen with the right active tab | unit + component | `pnpm exec vitest run src/frame src/console/useConsole.test.ts src/rails` | exists, update |
| notice | only private `system`/`reward`/`heal` entries not present at mount, text node, `role="status"`, clears on close, client rejection shows `Couldn't send that. Try again.` | component | `pnpm exec vitest run src/ledger/NoticeLine.test.ts` | no, Wave 0 |
| hub | queries SQL shapes (WHERE and OR chains, empty list refused), keys follow character and vendor target, inert default mounts bare | unit | `pnpm exec vitest run src/ledger/ledgerData.test.ts src/ledger/queries.test.ts` | no, Wave 0 |
| all | design guards over new files; img-onerror payload in item, vendor, faction, perk, recipe names, greeting and a notice line renders as text; `@game-data` modules import-free | static + component | `pnpm exec vitest run src/styles src/gameDataAlias.test.ts` | exists; scans new files; extend alias test |

### Sampling Rate
- **Per task commit:** the quick command for the touched slice (client or server).
- **Per wave merge:** root full suite with `--maxWorkers=1` plus `pnpm exec vue-tsc -b`.
- **Phase gate:** full suite green (ignoring the baseline failures) and `pnpm build` (includes `scripts/check-bundle.mjs`) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] Server pure helpers first (everything imports them): `data/item_stats.ts`, `item_usability.ts`, `vendor_pricing.ts`, `perk_rules.ts`, `inventory_rules.ts`, `item_rules.ts`, additions to `faction_rules.ts` and `crafting_rules.ts`, each with a `*.test.ts`
- [ ] Server real-handler files (harness copied from `creation_finalize.test.ts`: `capturedReducer`, `createMockCtx({ strict: true })`): `reducers/vendor_buyback.test.ts`, `quest_item_sale.test.ts`, `vendor_pricing_parity.test.ts`, `equip_item.test.ts`, `craft_quality.test.ts`; `views/vendor_buyback.test.ts`
- [ ] Local publish with `--break-clients` and `pnpm spacetime:generate -y` before any client file imports `tables.myVendorBuyback`
- [ ] Client pure models and tests: `src/ledger/{itemModel,compare,queries,ledgerData}`, `src/inventory/backpack`, `src/stats/{statsModel,format}`, `src/vendor/vendorModel`, `src/crafting/craftingModel`
- [ ] Component tests: shared pieces (`SegTabs`, `FilterChips`, `InlineConfirm`, `NoticeLine`, `GoldAmount`, `ItemTile`), the four screens at desktop and mobile
- [ ] Framework install: none

## Security Domain

`security_enforcement` is not set to false in config, so it applies.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (unchanged SpacetimeAuth session) | existing |
| V3 Session Management | no | existing |
| V4 Access Control | yes | Every reducer starts with `requireCharacterOwnedBy` (`ctx.sender` -> player -> user id); `buyback_last_sale` takes only the character id and reads everything else from the caller's own row; `vendor_buyback` is private and exposed only through a per-sender view. `item_instance`, `item_affix`, `faction_standing`-adjacent tables are public, so client `WHERE` filters scope the client only (pre-existing, not widened) |
| V5 Input Validation | yes | Server validates ownership, slot, stackability, balance and space; the client never sends prices, quantities or stats; all server strings (item, NPC, faction, perk, recipe names, greetings, notice lines) render as text nodes (no `v-html`, enforced by `designContract`); `title` and `aria-label` are built from strings, never HTML |
| V6 Cryptography | no | none |
| V8 Data Protection | yes | A player's last sale (item, price, vendor) must not reach other clients: private table plus view, with a test that a second owner sees nothing |
| V11 Business Logic | yes | Refund equals the stored payout (no profit loop), gold checked before mutation, one row per character (second sale replaces), double submit refused (`Nothing to buy back.`), concurrent calls serialize in the transaction |

### Known Threat Patterns for Vue + SpacetimeDB item and economy screens

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stored XSS via LLM- or player-generated names (items, vendor, faction, perk, recipe, greeting) | Tampering | Text nodes only; img-onerror escape test on each new screen and the notice line |
| Gold duplication through buy-back (forged price, repeated call, sell-then-buy loop with changed perks) | Tampering | Price stored server-side at sale; row cleared in the same transaction; client sends only the character id |
| Quest-item sale through an unguarded path (NL `sell`) | Elevation of privilege | One shared sell helper with the refusal; real-handler tests on all four paths |
| Other players' sales or inventories exposed | Information disclosure | Private `vendor_buyback` plus per-sender view; public item tables are a known pre-existing gap, not widened; never subscribe unfiltered |
| Inventory overflow past 50 (unequip, craft, salvage have no server gate) | Denial of service (game state) | Client gates as convenience; documented as server behavior, out of scope |
| Reducer spam or double click | DoS | Buttons inert until the promise settles; server idempotence per row; existing per-player limits |
| Unbounded client memory | DoS | Notice line keeps one entry; affix subscription limited to rolled instances |

## Project Constraints (from CLAUDE.md)

- SpacetimeDB rules: reducers are transactional and deterministic; read data through tables, views and subscriptions, never reducer return values; `ctx.sender` is the principal (never trust identity args); reducer calls use object syntax (`conn.reducers.buybackLastSale({ characterId })`); camelCase table handles; do not edit generated bindings (regenerate with `spacetime generate`); do not invent SpacetimeDB APIs.
- TypeScript module rules that apply to the new table, view and reducer: `table(OPTIONS, COLUMNS)` with indexes in OPTIONS; views may only use index or primary-key lookups, never `.iter()`; `insert` returns the ROW; `0n` placeholder only for autoInc ids; scheduled tables use `scheduledId` (not used here); timestamps are objects on the client (`createdAt.microsSinceUnixEpoch`); no optimistic UI (let subscriptions drive state).
- Feature checklist: tables, reducers, subscribe, call from the UI (do not forget the wiring), render. Here five reducers have never had a client caller.
- Publishing: local only and automatic is allowed; maincloud is manual and never automatic; never `--clear-database` unless a schema change requires it (a new table, view and reducer do not); the CLI flag is `-p`; check `admin_llm_status` key_length 108 before and after.
- Editing behavior: smallest change; do not touch unrelated files, configs or dependencies; do not invent APIs.
- Project memory rules honored: server is the source of truth (no copied constants; import through `@game-data`); prefer `fail()` over `SenderError` where character context exists (buy-back refusals use `fail`; a wrong-owner call has no usable character context, so `requireCharacterOwnedBy`'s `SenderError` stays); all new work includes unit tests; greenfield: no compat shims, no backups, a new table needs no migration; Keeper and NPC pronoun rules (client copy uses no first person and no pronoun for the Keeper, every NPC is male or female); no UI-SPEC rework before the UX overhaul (the contract is approved); UAT deferred to the milestone end; compact at about 65% context on long runs.
- UI contract guards (CONTEXT): no literal colors, no new tokens (pin 23), Phosphor and Inter only, font sizes 10/12/14/20, weights 400/500, spacing 4/8/16/24/32/48/64, text nodes only, no `replaceAll`, `.at` or `Object.hasOwn`.
- `.claude/skills/` contains only `run-local` (not relevant to implementation).

## Sources

### Primary (HIGH confidence)
- Server: `spacetimedb/src/reducers/items.ts` (105-250, 438-535, 897-1060), `items_crafting.ts` (whole), `renown.ts`, `renown_perk.ts`, `intent.ts` (940-1110), `characters.ts` (139-271), `quests.ts`, `combat.ts` (~543); `helpers/items.ts`, `economy.ts`, `character.ts`, `renown.ts`, `events.ts`, `examine.ts`, `schema_recorder.ts`, `test-utils.ts`; `data/crafting_rules.ts`, `renown_data.ts`, `combat_scaling.ts`, `mechanical_vocabulary.ts`, `xp.ts`, `faction_rules.ts`, `race_bonuses.ts`; `schema/tables.ts`; `views/{faction,combat,llm,index,types}.ts`; `reducers/creation_finalize.test.ts`, `character_info_intent.test.ts`; `data/no_ripple_word.test.ts`
- Client: `src/game/{gameData,queries,context,keyedBinding}.ts`, `src/net/bindTable.ts`, `src/frame/{AppFrame,Drawer,Sheet,MoreSheet,useScreens,tabs}.*`, `src/screens/*`, `src/console/{useConsole,feedStore,lines,cleanServerText}.ts`, `src/rails/{NearbyList,nearby,xp}.*`, `src/input/infoCommands.ts`, `src/session/useSession.ts`, `src/App.vue`, `src/creation/{creationData,queries}.ts`, `src/styles/{designContract,colors.guard,scrollbars,tokens.client}.test.ts`, `src/gameDataAlias.test.ts`, `vite.config.ts`, `tsconfig.json`, `package.json`, `scripts/check-bundle.mjs`
- Local database (read-only `spacetime sql --server local uwr`): `item_template`, `item_instance`, `item_affix`, `recipe_template`, `recipe_discovered`, `faction`, `faction_standing`, `vendor_inventory`, `npc`, `location`, `renown`, `renown_perk`, `pending_renown_perk`, `character`, `admin_llm_status`
- `git show v2.2-client:src/components/StatsPanel.vue` (percent scale); git history for the rename commits
- `.planning/phases/50-*/50-CONTEXT.md`, `50-UI-SPEC.md` (approved), `.planning/phases/49-*/49-RESEARCH.md` (format, harness, publish procedure), `46.1-09-PLAN.md`, `48-14-SUMMARY.md`

### Secondary (MEDIUM confidence)
- none

### Tertiary (LOW confidence)
- SDK behavior items A1 and A2 (reducer promise ordering, OR-chain size), marked `[ASSUMED]`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, nothing new; every reused module was read.
- Reducer contracts, buy-back design, shared-helper locations, client bindings and test blast radius: HIGH (read from code and the local database).
- Architecture of the hub and shell changes: HIGH for the pattern (Phase 49 precedent), MEDIUM for subscription churn and OR-chain size (A2).
- Pitfalls: HIGH for 1 to 9 and 13 (code read), MEDIUM for 12.

**Research date:** 2026-10-06
**Valid until:** 2026-11-05 (30 days; the server files are edited often, re-read `intent.ts`, `items.ts` and `AppFrame.vue` before editing)
