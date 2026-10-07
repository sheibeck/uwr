---
phase: 50-ledger-screens-character-and-economy
verified: 2026-10-06T22:40:00Z
status: human_needed
score: 13/14 must-haves verified (5 roadmap success criteria + 9 owner decisions; 1 routed to human, 1 passed by override)
behavior_unverified: 1
overrides_applied: 1
overrides:
  - must_have: "Crafting: the selected recipe shows its quality odds (ROADMAP SC4 / LDG-11)"
    reason: "Owner decision after the UI-SPEC draft (50-CONTEXT.md, 2026-10-06): craft quality shows the single deterministic result 'Quality: {Tier}' with a hint for what would raise it. There is no odds bar and quality is not made random (no balance change). Implemented as recipeDetail().qualityKey/qualityHint from the shared craftQualityForMaterialName/craftQualityUpgrade."
    accepted_by: "owner (recorded in 50-CONTEXT.md)"
    accepted_at: "2026-10-06T00:00:00Z"
behavior_unverified_items:
  - truth: "At 390x844 each screen opens as a full-height sheet above the tab bar (Bag opens inventory) and every action above works (ROADMAP SC5)"
    test: "Open the running local stack at 390x844 and at 1280. Open Bag, Stats, Crafting and Trade; run Equip, Unequip, Salvage (common and confirmed), Use/Eat, Buy, Sell (single and the stack quantity picker), Sell all junk, Buy back, Discover recipes, Craft and Take perk."
    expected: "Each screen is a full-height sheet above the visible tab bar on mobile (drawer on desktop); Bag tab opens Inventory with Bag active; every action sends its reducer once, the rows update from the subscription, focus returns as specified, and nothing overflows (the inventory grid keeps at least 2 rows visible with the dock open)."
    why_human: "jsdom component tests cover wiring and focus rules but not real viewport layout, sheet height, touch targets or live reducer round-trips. The owner deferred this live run to the end-of-milestone UAT."
human_verification:
  - test: "Live play of all four screens at 1280 and 390x844 (owner-deferred to the end-of-milestone UAT)"
    expected: "Inventory, Stats, Crafting and Trade render per 50-UI-SPEC in the drawer (desktop) and sheet (mobile); every action works end to end on the local stack."
    why_human: "Visual layout, viewport behaviour and live round-trips cannot be proven by grep or jsdom."
  - test: "Buy-back live: sell, buy back; sell, travel, try to buy back; sell, fill the bag, try to buy back; sell a stack partially with the quantity picker and buy it back"
    expected: "Exact refund and exact quantity restored; wrong place, full bag, short gold and 'already sold' each show the card reason and change nothing."
    why_human: "Covered by real-handler tests (vendor_buyback.test.ts, vendor_quantity.test.ts) but the owner asked for a live check at UAT."
  - test: "Finite stock live: buy a base-stock listing down to 0, confirm 'Sold out' with Buy unavailable, wait for the 15 minute restock"
    expected: "'×n' shown after names, the sold-out row keeps its place, restock refills base listings and never removes player-sold ones."
    why_human: "Scheduled tick timing and live subscription refresh."
  - test: "Discover recipes and Craft live with Elfansworth at Cormorant Stair"
    expected: "Discover creates the generated recipes (Iron Shard Dagger, Scrap Cloth Robe, Stone Pendant, then Herbal Draught); Craft shows 'Quality: {Tier}' with the hint; a refused craft costs nothing."
    why_human: "Live database contents and the end-to-end UI flow."
  - test: "Remaining items of the 50-23-SUMMARY deferred UAT checklist (/faction tier shift, 'Usable by you' ignoring level, salvage confirmations, Sell all junk preview, notice-line icons, equipped-salvage assumption A1, subscription size A2)"
    expected: "As written in 50-23-SUMMARY.md 'Deferred UAT checklist (milestone-end)'."
    why_human: "Owner-deferred live checks."
  - test: "Follow-up plans 50-28..50-40 (owner play-test, 2026-10-06/07): the deferred UAT list in 50-38-SUMMARY.md (backpack size and 50 slots, Organize, inventory salvage confirm in chances, Craft xN with Craft again and Equip, Discover card, crafting three columns, Craft/Salvage switch with 'May return', empty-roll card, salvage chances 50/25/10)"
    expected: "As written in 50-38-SUMMARY.md 'Deferred UAT'. Also try WR-03/WR-04/WR-05 of 50-REVIEW-FIX-iter3-client.md (preview while a new item's recipe loads, focus after salvaging, double-click on the card) and the bag-full refusal for Craft xN."
    why_human: "Owner-deferred live checks at 1280, 1920 and 390x844."
---

# Phase 50: Ledger Screens: Character and Economy Verification Report

**Phase Goal:** Players manage their gear, read their character's numbers, trade with vendors and craft through Ledger drawers on desktop and sheets on mobile.
**Verified:** 2026-10-06T22:40:00Z
**Status:** human_needed
**Re-verification:** No (initial verification)

Everything that can be verified from the code, the tests and the live local database holds. No blocking gap was found. The only open item is the owner-deferred live play at 1280 and 390x844.

## Goal Achievement

### Observable Truths: ROADMAP success criteria

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Inventory: equipment slots and backpack side by side, filters All/Gear/Materials/Food, slot count and gold; inspector with rarity, tier, ▲/▼ comparison, flavor, sell value, Equip / Salvage (LDG-01, LDG-02) | ✓ VERIFIED | `src/inventory/backpack.ts:13-16` filters; `backpackSlotCount`/`MAX_INVENTORY_SLOTS` from `@game-data/inventory_rules`; `InventoryMeta.vue` slots + gold. `inspector.ts:196-199` kicker (rarity, `Tier n`, slot), `:263-275` footer 'Sells for' via shared `sellPayout`, `:293` flavor from `template.description`. `Inspector.vue:207-221` comparison markers from `src/ledger/compare.ts` (shared `sumItemStats`). Equip → `equipItem`, Salvage → `salvageItem` (with confirmation). Mobile dock is intentionally compact (UI-SPEC A15). |
| 2 | Stats: base stat bars with gear bonus, derived-stats table, renown rank with perk choice, faction standing (LDG-03) | ✓ VERIFIED | `StatBars.vue` base + `gear-seg`; `DerivedTable.vue`; `RenownPanel.vue:74` 'Choose rank {n} perk' → `PerkChooser.vue:55` `chooseRenownPerk({ characterId, perkId })`; `FactionList.vue` fed by `game.factionStandings` (`my_faction_standings` view) and `factionTier` from `@game-data/faction_rules` (also used by `/faction` in `src/input/infoCommands.ts:13`). No Keeper's assessment (LDG-F1 deferred). |
| 3 | Vendor: name, role, faction, quote, rapport; For sale with 'Usable by you' and Buy; sellables with value, Sell, Sell all junk, buy back last sale; quest items unsellable (LDG-08, LDG-09) | ✓ VERIFIED | `VendorScreen.vue:121-135` (role 'Vendor · {faction}', quoted greeting, `rapportParts` over shared `rapportPercents`); `vendorModel.ts:120-124` filters, `forSaleRows` priced with `listingBuyPrice`; `ForSale.vue:84` `buyItem`; `SellPanel.vue:102` `sellItemQuantity`, `:186` `sellAllJunk`; `JustSold.vue:59` `buybackLastSale`; quest rows `canSell: false`, value '—'. Server refuses quest sales on all paths (`helpers/vendor_sale.ts:206`, `sell_all_junk` skip at `reducers/items.ts:283`). |
| 4 | Crafting: materials on hand, recipe list with category tabs, 'only craftable', have-versus-need; selected recipe shows quality, optional reagent / affix and Craft; Discover recipes reachable (LDG-10, LDG-11) | ✓ PASSED (override) | Chips Weapon/Armor/Accessory/Consumable (`craftingModel.ts:60-63`), 'Show only craftable' (`RecipeList.vue:161`), `MaterialsOnHand.vue`, `ReagentPicker.vue`, Craft → `craftRecipe` (`RecipeDetail.vue:214`), Discover → `researchRecipes` (`MaterialsOnHand.vue:45`, `RecipeList.vue:111`). "Quality odds" replaced by the owner-decided single `Quality: {Tier}` + hint (`craftingModel.ts:365-373`). Override: owner decision in 50-CONTEXT.md. |
| 5 | At 390x844 each screen opens as a full-height sheet above the tab bar (Bag opens inventory) and every action works | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Wiring present: `src/screens/screens.ts` registers InventoryScreen/StatsScreen/CraftingScreen/VendorScreen with meta; `src/frame/tabs.ts:11,23` Bag → 'bag'; mobile tab variants in each screen; frame tests green. Real viewport behaviour is owner-deferred to the milestone-end UAT. |

### Observable Truths: owner decisions (50-CONTEXT.md)

| # | Decision | Status | Evidence |
|---|----------|--------|----------|
| 6 | Server buy-back: private one-row-per-character table, `buyback_last_sale` refunds exact price and restores the item/stack, owner-only, gold, place; Sell all junk records nothing; per-sender view | ✓ VERIFIED | `schema/tables.ts:1476` `vendor_buyback` (no `public`), PK `characterId`; `views/vendor_buyback.ts` PK lookups only; `reducers/items.ts:220-265` all refusals before writes; `requireCharacterOwnedBy`; `delete_character` cleanup `reducers/characters.ts:270`. Tests `vendor_buyback.test.ts` (sell→buy back, replace, junk no-record, wrong owner/gold/place/full bag) pass. |
| 7 | All four screens in one pass | ✓ VERIFIED | All four screens built and registered; placeholders deleted (`src/screens/` holds only Map/Social/WorldEvents + EmptyState). |
| 8 | Quest-item refusal on the server with "Quest items can't be sold." | ✓ VERIFIED | `QUEST_ITEM_SALE_REFUSAL` in `sellInstanceToVendor`, used by `sell_item`, `sell_item_quantity`, typed `sell`/`sell N`; skipped by `sell_all_junk` and typed `sell junk`. `quest_item_sale.test.ts` passes. |
| 9 | Single craft quality (`Quality: {Tier}` + hint, no odds, no randomness) | ✓ VERIFIED | `craftQualityForMaterialName` shared by `planCraft` and the client; `RecipeDetail.vue:260`. |
| 10 | Craft validate-before-mutate | ✓ VERIFIED | `items_crafting.ts:164-194` `planCraft` decides every refusal before `removeItemFromInventory`; `planCraft` merges repeated requirements (`crafting_rules.ts:495-514`). `craft_quality.test.ts` "craft_recipe refusals cost nothing" (7 cases) passes. |
| 11 | Renown perk bug kept as a todo | ✓ VERIFIED | `.planning/todos/pending/2026-10-06-renown-passive-perks-no-effect.md` exists; `perkDisplayName` shows names; a test pins current behaviour (perk_rules.test.ts). |
| 12 | Vendor base stock (rule-based, area band, common-weighted, deterministic, scheduled restock with module-identity guard, never touches player listings) | ✓ VERIFIED | `index.ts:339-407` (`ensureVendorRestockScheduled`, `restockVendor`, guard `ctx.sender === ctx.databaseIdentity`); `vendor_base_stock` marker table; no `Math.random`/`Date` in `data/vendor_stock.ts`, `data/recipe_rules.ts`, `index.ts`. `vendor_restock.test.ts` passes. Live DB: 16 marker rows, 1 pending tick. |
| 13 | Recipe generation by rule (stored once, shared, deterministic, crafts end to end) | ✓ VERIFIED | `items_crafting.ts:24-117` uses `recipeCandidates`/`generatedOutput`, keyed `recipesByKey`, max 3 per Discover, 'You discover nothing new.'; `recipe_discovery.test.ts` (Elfansworth bag, shared rows, level band, crafts end to end) and client `generatedRecipes.test.ts` pass. |
| 14 | Finite stock, price floor and sell quantity | ✓ VERIFIED | `vendor_inventory.quantity u64 default 1` (`tables.ts:895`); `addToVendorListing`/`takeFromVendorListing` (`vendor_sale.ts:141-180`); `buy_item` refuses '{Vendor} has no more {item}.' before writes; `listingBuyPrice` floor `unitSellCeiling + 1` (`data/vendor_pricing.ts`) charged by server and shown by client; `sell_item_quantity` reducer; buy-back takes units back out of the listing; client '×n', 'Sold out', `SellQuantity.vue` picker. `vendor_quantity.test.ts` (no duplication, floor matrix, partial sale, buy-back quantity, typed paths) passes. |

**Score:** 13/14 verified (one by override), 1 present but behavior-unverified (SC5, live viewport).

### Plan must-haves (50-01 to 50-27)

| Plan | Must-have focus | Status | Evidence |
|------|-----------------|--------|----------|
| 50-01 | Shared per-instance stat sum, examine uses it, parity with getEquippedBonuses, capacity rule | ✓ | `helpers/examine.ts:3` imports `sumItemStats`; `item_stats_parity.test.ts`, `inventory_rules.test.ts` pass |
| 50-02 | planCraft, quality helpers, validate-before-mutate | ✓ | see truth 10 |
| 50-03 | perkBonusByField shared, perkDisplayName, factionTier shared, bug pinned not fixed | ✓ | `helpers/renown.ts:367`; `infoCommands.ts` + `statsModel.ts` use `factionTier` |
| 50-04 | canEquipItem shared by equip_item and client, quest rule, use keys, salvage rule | ✓ | `reducers/items.ts:519`; `inspector.ts:1`, `vendorModel.ts:3`; `item_rules_parity.test.ts` passes |
| 50-05 | Shared vendor pricing with differential tests | ✓ | `vendor_pricing_parity.test.ts` passes |
| 50-06 | Private vendor_buyback + my_vendor_buyback PK-only view | ✓ | see truth 6; `views/vendor_buyback.test.ts` passes |
| 50-07 | Shared sell helper, quest refusal, affix snapshot, buy-back record | ✓ | `helpers/vendor_sale.ts` |
| 50-08 | buyback_last_sale rules, delete_character cleanup | ✓ | see truth 6 |
| 50-09 | Local publish `--break-clients`, key 108 before/after, bindings | ✓ | 50-09-SUMMARY evidence; live `admin_llm_status.key_length = 108`; `src/module_bindings/buyback_last_sale_reducer.ts`, `my_vendor_buyback_table.ts` |
| 50-10 | LedgerData hub, filtered subscriptions, reducers only while connected, action runner, inert default | ✓ | `src/ledger/ledgerData.ts`, `queries.ts` (every query has WHERE except the per-sender view), `actionRunner.ts`, `ledgerContext.ts` |
| 50-11 | Item model, comparison, backpack models, @game-data alias | ✓ | `itemModel.ts`, `compare.ts`, `backpack.ts`; `vite.config.ts:15`, `tsconfig.json:11`; `gameDataAlias.test.ts` |
| 50-12 | Session owns hub, screenArgs cleared off-vendor, header meta slot | ✓ | `useSession.ts:164,428,532`; `App.vue:24`; `AppFrame.vue:46-81` |
| 50-13 | Shared parts (GoldAmount, FilterChips, SegTabs, InlineConfirm, ItemTile, NoticeLine) | ✓ | `src/ledger/*.vue`; `parts.test.ts`, `NoticeLine.test.ts` pass |
| 50-14 | Inspector model/component, salvage confirmation, equipped unequip→salvage | ✓ | `Inspector.vue:129-160` |
| 50-15 | Inventory screen desktop + mobile | ✓ (layout: human) | `InventoryScreen.vue`, `BackpackGrid.vue`, `EquippedSlots.vue`; `InventoryScreen.test.ts` |
| 50-16 | Stats model, formatter, perk chooser | ✓ | `statsModel.ts`, `format.ts`, `PerkChooser.vue` |
| 50-17 | Stats screen desktop + mobile, header meta | ✓ (layout: human) | `StatsScreen.vue`, `StatsMeta.vue` |
| 50-18 | Nearby Trade opens vendor by NPC; vendor model | ✓ | `NearbyList.vue:106` `openScreen('vendor', { npcId, npcName })`; `resolveVendor`, `vendorLeft` |
| 50-19 | Sell side, Sell all junk confirmation, Just sold card | ✓ | `SellPanel.vue`, `JustSold.vue`; single Sell now goes through `sellItemQuantity` with quantity 1 (superseded by 50-27; equivalent server path) |
| 50-20 | Trade screen band, rapport, For sale, mobile tabs, no-longer-nearby | ✓ (layout: human) | `VendorScreen.vue`, `VendorMeta.vue:20` |
| 50-21 | Crafting model, have/need, planCraft reasons, essence gate, reagent slots | ✓ | `craftingModel.ts` imports `planCraft`, `ESSENCE_QUALITY_GATE`, `AFFIX_SLOTS_BY_QUALITY` |
| 50-22 | Crafting screen desktop + mobile | ✓ (layout: human) | `CraftingScreen.vue`, `RecipeList.vue`, `RecipeDetail.vue`, `MaterialsOnHand.vue` |
| 50-23 | Register screens, Trade title, delete placeholders, gate, try-out and UAT lists | ✓ | `screens.ts` (vendor title 'Trade', label 'Vendor'); 50-23-SUMMARY holds both lists |
| 50-24 | Vendor base stock | ✓ | see truth 12 |
| 50-25 | Recipe generation | ✓ | see truth 13 |
| 50-26 | Finite stock, price floor, sell_item_quantity | ✓ | see truth 14 |
| 50-27 | Client stock '×n', Sold out, listingBuyPrice, quantity picker, Just sold quantity | ✓ | `vendorModel.ts:233-271,574-617`; `SellQuantity.vue` (PhMinus/PhPlus, clamp, digits only); `SellPanel.vue:89-118` |

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `spacetimedb/src/data/{item_stats,inventory_rules,crafting_rules,perk_rules,faction_rules,item_rules,item_usability,vendor_pricing,vendor_stock,recipe_rules}.ts` | ✓ VERIFIED | Import-free shared modules, consumed by reducers and by the client through `@game-data` |
| `spacetimedb/src/helpers/vendor_sale.ts` | ✓ VERIFIED | Single sale helper used by every sell path |
| `spacetimedb/src/reducers/items.ts`, `items_crafting.ts`, `index.ts` (restock), `views/vendor_buyback.ts` | ✓ VERIFIED | Substantive, tested with real handlers |
| `src/ledger/*` | ✓ VERIFIED | Hub, queries, models, shared parts |
| `src/inventory/*`, `src/stats/*`, `src/vendor/*`, `src/crafting/*` | ✓ VERIFIED | Real screens wired into `src/screens/screens.ts` |

### Key Link Verification (CLAUDE.md checklist: client calls every reducer)

| Reducer | Client call site | Status |
|---------|------------------|--------|
| equip_item | `Inspector.vue:106` | ✓ WIRED |
| unequip_item | `Inspector.vue:111,153` | ✓ WIRED |
| use_item | `Inspector.vue:115` | ✓ WIRED |
| eat_food | `Inspector.vue:118` | ✓ WIRED |
| learn_recipe_scroll | `Inspector.vue:121` | ✓ WIRED |
| salvage_item | `Inspector.vue:157` | ✓ WIRED |
| buy_item | `ForSale.vue:84` | ✓ WIRED |
| sell_item_quantity (single sale = quantity 1) | `SellPanel.vue:102` | ✓ WIRED |
| sell_item | exposed in hub, not called by UI (kept for older clients; `sell_item_quantity` covers the whole-instance case) | ℹ️ INTENTIONAL |
| sell_all_junk | `SellPanel.vue:186` | ✓ WIRED |
| buyback_last_sale | `JustSold.vue:59` | ✓ WIRED |
| research_recipes | `MaterialsOnHand.vue:45`, `RecipeList.vue:111` | ✓ WIRED |
| craft_recipe | `RecipeDetail.vue:214` | ✓ WIRED |
| choose_renown_perk | `PerkChooser.vue:55` | ✓ WIRED |
| restock_vendors | scheduled only (guarded against client calls) | ✓ N/A |
| Nearby Trade → vendor screen | `NearbyList.vue:106` → `AppFrame.vue` screenArgs → `VendorScreen.vue:46,100` → `ledger.setVendor` | ✓ WIRED |

All calls use object syntax.

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| Inventory / Inspector | `ledger.items`, `affixes`, `templates` | `item_instance WHERE owner_character_id`, `item_affix`/`item_template` id-lists | Yes | ✓ FLOWING |
| Trade For sale | `ledger.vendorStock` | `vendor_inventory WHERE npc_id` (setVendor) | Yes (live DB: 20 listings, quantity column) | ✓ FLOWING |
| Just sold | `ledger.lastSale` | `my_vendor_buyback` view (per-sender) | Yes (live DB: 1 row in vendor_buyback) | ✓ FLOWING |
| Crafting | `recipesKnown`, `recipes` | `recipe_discovered WHERE character_id`, `recipe_template` id-list | Yes | ✓ FLOWING |
| Stats | character row, `factionStandings`, `pendingPerks` | game hub + `pending_renown_perk WHERE character_id` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks and Gates

| Check | Command | Result | Status |
|-------|---------|--------|--------|
| Client suite | `pnpm exec vitest run --dir src --maxWorkers=2` | 142 files, 3161 tests passed, exit 0 | ✓ PASS |
| Type check | `pnpm exec vue-tsc -b` | exit 0, no output; working tree still clean | ✓ PASS |
| Touched server suites (23 files) | `pnpm exec vitest run <23 phase-50 test files>` in `spacetimedb/` | 23 files, 623 tests passed | ✓ PASS |
| Live schema: `vendor_inventory.quantity` | `spacetime sql uwr "SELECT id, npc_id, item_template_id, price, quantity FROM vendor_inventory LIMIT 5" --server local` | column present; base rows show quantity 3 | ✓ PASS |
| Live schema: `vendor_buyback` | `SELECT COUNT(*) FROM vendor_buyback` | 1 | ✓ PASS |
| Live schema: `vendor_base_stock` | `SELECT COUNT(*) FROM vendor_base_stock` | 16 | ✓ PASS |
| Live schema: `vendor_restock_tick` | `SELECT * FROM vendor_restock_tick` | 1 pending tick, after_npc_id 0 | ✓ PASS |
| Key intact | `SELECT key_length FROM admin_llm_status` | 108 | ✓ PASS |
| Live module exposes new reducers/views | `spacetime describe uwr --server local --json` | `sell_item_quantity`, `buyback_last_sale`, `restock_vendors`, `my_vendor_buyback` present | ✓ PASS |

Publish evidence: 50-09, 50-24, 50-25 and 50-26 SUMMARYs record the exact `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null` with key_length 108 before and after, no clear and no maincloud. The live database state (schema, key, reducers) is consistent with that.

### Probe Execution

Step 7c: SKIPPED (the phase declares no `probe-*.sh` scripts; verification is through vitest suites and read-only SQL).

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| LDG-01 | Inventory slots + backpack, filters, slot count, gold | ✓ SATISFIED | Truth 1 |
| LDG-02 | Inspector rarity, tier, ▲/▼, flavor, sell value, Equip / Salvage | ✓ SATISFIED | Truth 1 |
| LDG-03 | Stats bars + gear, derived, renown + perk, factions | ✓ SATISFIED | Truth 2 |
| LDG-08 | Vendor band, rapport, For sale, Usable by you, Buy | ✓ SATISFIED | Truth 3 |
| LDG-09 | Sellables, Sell, Sell all junk, buy back, quest unsellable | ✓ SATISFIED | Truths 3, 6, 8, 14 |
| LDG-10 | Materials, recipe list, category tabs, only craftable, have/need | ✓ SATISFIED | Truth 4 |
| LDG-11 | Quality, reagent / affix, Craft, Discover | ✓ SATISFIED (override on "odds") | Truth 4, 9, 13 |

No orphaned requirements: REQUIREMENTS.md maps exactly LDG-01..03 and LDG-08..11 to Phase 50, all claimed by plans.

### Anti-Patterns Found

No `TBD`, `FIXME`, `XXX`, `TODO`, `HACK` or placeholder text in the 141 source files changed by the phase (generated bindings excluded).

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `spacetimedb/src/helpers/vendor_sale.ts` | 251-263, 267 | A temporary (conjured) item is paid for and added to the vendor listing as an ordinary permanent listing; only the buy-back record is skipped | ℹ️ Info | Already the behaviour before this phase (sales always created listings). Buyers pay `listingBuyPrice`, above the payout. Worth a look when conjured items matter. |
| `.planning/ROADMAP.md` | 442-499 | Phase 50 says "23 plans" and does not list 50-24..50-27; all plan boxes unchecked | ℹ️ Info | Bookkeeping for the orchestrator. |
| `50-VALIDATION.md` | — | The validation map does not cover the 50-24..50-27 follow-up plans | ℹ️ Info | Their real-handler tests exist and pass (`vendor_restock`, `recipe_discovery`, `vendor_quantity`, client `generatedRecipes`, `SellPanel`, `vendorModel`). |
| `50-23-SUMMARY.md` | deferred UAT list | "buy and sell do not check vendor proximity (buy-back does)" is stale: `buy_item`, `sell_item`, `sell_item_quantity` and `sell_all_junk` now all require a vendor at the character's location | ℹ️ Info | Update the UAT checklist wording before the milestone-end UAT. |
| `src/vendor/vendorModel.ts` | 560-566 | Client `stillStocked` takes the first matching listing in array order; server `findVendorListing` takes the lowest id | ℹ️ Info | Duplicate listings of the same template and tier are not created by any writer (they merge), so this cannot diverge today. |

### Human Verification Required

1. **Live play of all four screens at 1280 and 390x844** (owner-deferred to the end-of-milestone UAT)
   - Test: open Bag, Stats, Crafting and Trade on desktop and at 390x844, and run every action (Equip, Unequip, Salvage, Use/Eat, Learn, Buy, Sell single and partial stack, Sell all junk, Buy back, Discover recipes, Craft, Take perk).
   - Expected: drawers on desktop; full-height sheets above the visible tab bar on mobile, with Bag opening Inventory; every action round-trips and updates from the subscriptions.
   - Why human: viewport layout and live round-trips.
2. **Buy-back and finite stock live**: sell then buy back, partial-stack buy-back, wrong place, full bag, already-resold; buy a base listing to Sold out and watch the restock.
3. **Discover and Craft live** with Elfansworth at Cormorant Stair (generated recipes, `Quality: {Tier}` and hint, refused craft costs nothing).
4. **The rest of the 50-23-SUMMARY deferred UAT checklist.**

### Gaps Summary

No gaps. Every roadmap success criterion, requirement, owner decision and plan must-have is backed by code that exists, is substantive and is wired. Each server rule has passing real-handler tests (623 tests across the 23 touched server suites). The client suite (3161 tests) and vue-tsc are green. The live local database has the `vendor_inventory.quantity`, `vendor_buyback`, `vendor_base_stock` and `vendor_restock_tick` schema, the new reducers and the view, with key_length 108.

One deviation from the ROADMAP wording ("quality odds") was decided by the owner and is recorded as an override. The phase is `human_needed` only because the owner deferred the live play at 1280 and 390x844 to the end-of-milestone UAT.

### Follow-up (plans 50-28 to 50-40, added 2026-10-07)

The owner's play-test follow-up was executed after this report: crafting and backpack per the updated mocks (50-28..50-37), the inventory header with gold and Organize and the 50-slot fill grid (50-39), salvage by chance with no craft loop (50-40, published locally with key_length 108 before and after), and the crafting Salvage tab (50-38). Code review iteration 3 (`50-REVIEW-iter3-server.md`, `50-REVIEW-iter3-client.md`) found no Critical issues; all Warnings were fixed (`50-REVIEW-FIX-iter3-server.md` incl. the Craft xN bag-capacity gate, published locally; `50-REVIEW-FIX-iter3-client.md`). Full `npx vitest run` passes apart from the three baseline files, and `npx vue-tsc -b` is clean. Status stays `human_needed` for the owner-deferred live UAT (see the new human_verification item).

---

_Verified: 2026-10-06T22:40:00Z_
_Verifier: Claude (gsd-verifier)_
