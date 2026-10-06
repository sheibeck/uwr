---
phase: 50-ledger-screens-character-and-economy
plan: 23
subsystem: client-registration-and-phase-gate
tags: [vue, registration, phase-gate, uat]

requires:
  - phase: 50-15
    provides: "InventoryScreen, InventoryMeta"
  - phase: 50-17
    provides: "StatsScreen, StatsMeta"
  - phase: 50-20
    provides: "VendorScreen, VendorMeta"
  - phase: 50-22
    provides: "CraftingScreen, CraftingMeta"
provides:
  - "SCREENS entries for bag, stats, craft and vendor point at the real screens with their header meta; the vendor drawer and sheet are titled Trade"
  - "The four Phase 45 placeholders are deleted"
  - "50-VALIDATION.md validated (nyquist_compliant true, wave_0_complete true)"
  - "The owner try-out list and the deferred UAT checklist (below)"
affects: [Phase 51 (UX overhaul), Phase 52 (loot rails, bank, admin screens, player trade)]

tech-stack:
  added: []
  patterns:
    - "The screen registry is the only place that knows a screen's body and header meta; AppFrame renders ScreenDef.meta in the drawer and sheet #meta slot"

key-files:
  created: []
  modified:
    - src/screens/screens.ts
    - src/screens/screens.test.ts
    - src/frame/AppFrame.screens.test.ts
    - src/frame/frameControls.test.ts
    - .planning/phases/50-ledger-screens-character-and-economy/50-VALIDATION.md
  deleted:
    - src/screens/InventoryScreen.vue
    - src/screens/StatsScreen.vue
    - src/screens/VendorScreen.vue
    - src/screens/CraftingScreen.vue

key-decisions:
  - "Vendor drawer and sheet title is Trade (close label Close Trade); the More row and the ScreenDef label stay Vendor (UI-SPEC A6)"
  - "Map, Social and World events keep their Phase 45 placeholders and have no meta"

requirements-completed: [LDG-01, LDG-02, LDG-03, LDG-08, LDG-09, LDG-10, LDG-11]

status: complete
duration: 20min
completed: 2026-10-06
---

# Phase 50 Plan 23: Registration, phase gate and the owner try-out list Summary

The Inventory, Stats, Crafting and Trade screens are now live in the drawer (desktop) and sheet (390x844) shells with their header meta; the four placeholders are gone, the phase gate is green on all four runs, 50-VALIDATION.md is validated, and this file holds the owner try-out list and the deferred UAT checklist.

## What changed

- `src/screens/screens.ts`: imports the four screens and their meta from `src/inventory`, `src/stats`, `src/crafting` and `src/vendor`; the bag, stats, craft and vendor entries carry `meta`; the vendor entry is `title: 'Trade'`, `label: 'Vendor'`.
- `src/screens/screens.test.ts`: the placeholder loop covers only map, social and events (and asserts that); a new describe mounts bare each of the four ledger screens (their no-character lines `Your backpack is empty.`, `No stats to show yet.`, `No recipes known yet.`, `No vendor here.`), checks meta presence, the Trade title with the Vendor label, and that the three remaining placeholders have no meta.
- `src/frame/AppFrame.screens.test.ts`: bag line now `Your backpack is empty.`; More then Vendor expects `Trade`, `No vendor here.` and `Close Trade`; added More then Stats, Crafting and Vendor (sheet title, More pressed, tab bar present), the tab bar under the Bag sheet, and a populated meta test (fake game with a character plus a fake ledger with two applied bag rows: the drawer shows `2 / 50 slots`); `mountFrame` takes an optional ledger provided under `LEDGER_KEY`.
- `src/frame/frameControls.test.ts`: one expectation changed from `Vendor` to `Trade` (the screen-arguments test reads the drawer title; see Deviations).
- Placeholders deleted with `git rm`; `grep -rlE "screens/(Inventory|Stats|Vendor|Crafting)Screen" src` prints nothing.

## Phase gate

| Run | Result |
|-----|--------|
| `pnpm exec vitest run src/screens src/frame src/inventory src/stats src/vendor src/crafting src/ledger --maxWorkers=2` (Task 1 slice) | 41 files, 851 tests; green after the frameControls fix |
| `pnpm exec vitest run --dir src --maxWorkers=2` | 140 files, 3062 tests passed (includes the src/styles design guards: type scale, weights, spacing, colors, the 23-token pin, Phosphor only, no inline svg, no raw-HTML directive, scrollbars) |
| `pnpm exec vue-tsc -b` | exit 0 |
| `pnpm build` | exit 0; vite built 2082 modules; bundle guard: `bundle clean: 4 files scanned` |
| `cd spacetimedb && pnpm exec vitest run src/data src/views/vendor_buyback.test.ts src/reducers/vendor_buyback.test.ts src/reducers/quest_item_sale.test.ts src/reducers/vendor_pricing_parity.test.ts src/reducers/item_rules_parity.test.ts src/reducers/craft_quality.test.ts src/helpers/item_stats_parity.test.ts src/helpers/examine.test.ts --maxWorkers=1` | 31 files, 945 tests passed |
| `cd spacetimedb && pnpm exec vitest run --maxWorkers=1 --exclude "**/measurement.results.test.ts"` | 107 files, 4340 tests passed (includes the banned-word guard in src/data) |

The full module run left `spacetimedb/src/helpers/__snapshots__/claude_request.test.ts.snap` modified by line endings only (checked with `git diff --ignore-cr-at-eol`, empty); it was restored with `git restore` and the tree is clean apart from the intended changes. The two scripts/llm baselines were not in the requested runs (the root `--dir src` run does not include them), so nothing needed excluding.

## File ownership over the phase

`git log --grep="(50-" --name-only --format= | sort -u` (150 files):

- `src/game/gameData.ts` and `src/game/queries.ts`: never changed by a Phase 50 commit.
- `src/game/context.ts`: changed once, in `94ef2171` (Plan 50-12), only for the FrameControls screen arguments. The whole diff:

```diff
+/** Arguments a screen opens with (the vendor screen: which NPC). */
+export interface ScreenArgs {
+  npcId?: bigint;
+  npcName?: string;
+}
+
 export interface FrameControls {
   readonly isDesktop: Readonly<Ref<boolean>>;
   readonly activeScreen: Readonly<Ref<ActiveScreen>>;
-  openScreen(id: ScreenId | 'encounter'): void;
+  /** The arguments of the open vendor screen; null for every other screen and when closed. */
+  readonly screenArgs: Readonly<Ref<ScreenArgs | null>>;
+  openScreen(id: ScreenId | 'encounter', args?: ScreenArgs): void;
...
+    screenArgs: constant<ScreenArgs | null>(null),
```

- `src/module_bindings`: changed only in `492386b2` (Plan 50-09 regeneration): `buyback_last_sale_reducer.ts`, `index.ts`, `my_vendor_buyback_table.ts`, `types.ts`, `types/reducers.ts`, all additive for the buy-back view and reducer.

## Validation map

`50-VALIDATION.md` now names the real test file in every row (equip parity is `spacetimedb/src/reducers/item_rules_parity.test.ts`, there is no `equip_item.test.ts`); the LDG-11 row that pinned "an essence too weak consumes inputs and commits" is replaced by the owner's fix (every `craft_recipe` refusal leaves inventory and gold unchanged, `src/reducers/craft_quality.test.ts`, describe `craft_recipe refusals cost nothing`); Wave 0 items are ticked; frontmatter is `status: validated`, `nyquist_compliant: true`, `wave_0_complete: true`. The "Feedback latency < 60s" box is left unticked on purpose: the whole client suite takes about 223 s at two workers (a single slice runs in 10 to 60 s). Every file path in the map was checked with `test -f` (only the old `equip_item.test.ts` name was missing, now fixed).

## Owner try-out list (running local stack)

Only read-only `SELECT` queries were run against the live local database (`spacetime sql --server local uwr "SELECT ..."` on character, location, location_connection, npc, item_instance joined to item_template, vendor_inventory, vendor_buyback, recipe_template, recipe_discovered, faction, faction_standing, renown, renown_perk and pending_renown_perk). No reducer was called, nothing was published, `llm_config` was not read, and no server was started or stopped.

**What the local data holds right now (read 2026-10-06).** It differs from the research snapshot.
- Two characters. Elfansworth (Gloamweaver, Dark-Elf, level 3, 105 gold) is at Saltwidow's Rest (location 4100, region Tessarine Shelf), bound at Orrin Sill. Armond (Gloomknife, Dark-Elf, level 1, 0 gold) is at Orrin Sill.
- Elfansworth equips Scout Jerkin (chest), Scout Pants (legs), Scout Boots (boots) and Training Dagger (main hand), all common. His backpack holds 8 stacks, all materials: Lamp Oil x12, Peat x9, Herbs x18, Scrap Cloth x11, Iron Shard x3, Stone x11, Murky Water x4 and one Life Stone (uncommon). No item is junk and no item has an affix. Armond carries only the same four equipped pieces (empty backpack).
- Renown: Elfansworth has 25 points, rank 1 (Unsung), no chosen perk and no pending perk.
- Vendors: Sabeth Orrowyn at Orrin Sill (location 1) and Hesper Duhallow at Cormorant Stair (location 4097). Bankers: Dovan Hesk (Orrin Sill) and Brother Ambrose Veltane (Cormorant Stair). Odalys Brannoch is a lore NPC at Cormorant Stair.
- Crafting stations: Orrin Sill and Cormorant Stair only (`crafting_available` true there; false at every other location, including Saltwidow's Rest).
- Empty tables: `vendor_inventory` (no vendor has stock), `vendor_buyback` (no sale recorded), `recipe_template`, `recipe_discovered`, `faction`, `faction_standing`, `renown_perk`, `pending_renown_perk`.
- Route: Saltwidow's Rest connects directly to Cormorant Stair (and to Drowned Crane Flats); Cormorant Stair connects to Saltwidow's Rest, Violet Cut and The Passage to Tessarine Shelf.

The module was published locally in Plan 09 (additive, `--break-clients`, key length 108 before and after, only the buy-back bindings changed). Reload the Vite page (http://localhost:5173) so the new bindings load, then:

1. **Inventory.** Play as Elfansworth. Open Bag (the desktop header Bag button, or the mobile Bag tab). You should see the header read `8 / 50 slots` with `105` gold; the Equipped column shows Scout Jerkin, Scout Pants, Scout Boots and Training Dagger and Gear totals (Armor Class from the leather); the Backpack grid shows eight material stacks and empty tiles under All. Select Lamp Oil or Life Stone to see the inspector (card on desktop, dock on mobile). Select an equipped piece and use Unequip, then Equip it again (the bag count goes to 9 and back to 8, and the comparison row shows the change). Try the Gear, Materials and Food filters (Gear and Food show their empty lines such as `No gear in your backpack.` while only materials are in the bag; unequip a piece and it appears under Gear). Salvage destroys the item: a common unequipped item goes at once, any other rarity asks first (Keep it / Salvage), and an equipped piece always asks first and is unequipped before it is broken down. Materials have no Salvage button.
2. **Stats.** Open Stats (header Stats, or More then Stats). You should see the base stat bars with the gear segment on top (the leather adds Armor Class), the Derived table, `Renown · Rank 1, Unsung` with 25 points and `No perks yet.`, and `No standing with any faction yet.` because no faction exists locally. The desktop header shows `Elfansworth · Level 3 · ... XP · Bound at Orrin Sill`.
3. **Vendor (Trade).** Elfansworth is at Saltwidow's Rest, which has no vendor: Trade shows `No vendor here.` with `Find a vendor in Nearby, then choose Trade.`. Move to Cormorant Stair (one step; Map or the route row). Then in Nearby choose Trade on Hesper Duhallow (mobile: More then Vendor, which picks the one vendor itself). For sale starts empty (`Hesper Duhallow has nothing for sale right now.`) because vendor stock only comes from player sales. Sell something cheap (for example one Stone or the Iron Shard): it appears in For sale and in the Just sold card, your gold goes up, then Buy back returns the item and takes the gold back, and the card goes. Try Sell all junk: it is disabled (`No junk to sell`) because nothing is junk; if a junk item ever turns up it asks first with the count and the gold. Travel away (back to Saltwidow's Rest) with the drawer open to see `Hesper Duhallow is no longer nearby.` and the disabled Buy; Buy back from a different place is refused (the card says so). Armond (0 gold, empty backpack) shows the not-enough-gold and empty-sell states at Orrin Sill with Sabeth Orrowyn.
4. **Crafting.** Open Crafting (header Craft, or More then Crafting). At Saltwidow's Rest the header shows `No crafting station here`; at Cormorant Stair (or Orrin Sill) it shows the station tag. No recipe exists locally, so the list says `No recipes known yet.`; Materials on hand lists the eight stacks; Discover recipes at a station answers `You discover nothing new.` in the feed (a free, local-only reducer: it only inserts a recipe row when a recipe template exists, and none does). The recipe detail, the single Quality line, the reagent and essence slots and Craft can only be seen once recipes exist (they are covered by tests).
5. **Mobile.** Devtools at 390x844: the Bag tab opens Inventory with Bag active; More opens a list of Stats, Crafting, Events, Vendor and Log out; Stats, Crafting and Vendor (titled Trade) open as sheets with More active; the tab bar stays visible under every sheet; Escape and the close button return focus to the tab.
6. **Cautions.** Taking a renown perk on the live server can queue a paid LLM generation for the next rank (there is no pending perk now, so you cannot take one yet). Salvage, sales and buy-back are real changes to the local database. Do not publish to maincloud from here.

## Deferred UAT checklist (milestone-end)

Each item says what to check and what you should see.

- [ ] **The `/faction` tier shift.** Negative standings read one tier milder than before (from 50-03-SUMMARY): -1 to -24 now reads Neutral (was Unfriendly); -26 to -49 reads Unfriendly (was Hostile); -51 to -99 reads Hostile (was Hated). Unchanged: -25 Unfriendly, -50 Hostile, -100 and below Hated, 0 and above. Check: type `/faction` and open Stats; the tier word for the same faction is the same in both. (Needs a faction row; none exists locally.)
- [ ] **"Usable by you" ignores level.** The server has no level gate (world-tier design), so level-short items stay listed and buyable, with `Requires Lv n` in red. Check: a level-short item is still shown under Usable by you and Equip still works. A hard gate would be a one-line model change.
- [ ] **No quest-marker generator yet.** The quest-item marker (template slot `quest`) has no generator: the server refuses quest sales on all four sell paths (`sell_item`, `sell`, `sell N`, `sell junk` in `submit_intent`) with `Quest items can't be sold.` and the UI hides Sell, but no live item carries the marker today. Check when quests start giving quest items.
- [ ] **Buy-back rules.** Only the last single Sell counts (a second sale replaces it); Sell all junk records nothing; Buy back returns the exact instance with its affixes and takes back exactly the sale price; it is refused for the wrong owner, with too little gold, at a different location than the sale, or with a full bag, and each refusal leaves the card. Check live: sell, buy back; sell, travel, try to buy back; sell, fill the bag, try to buy back.
- [ ] **The single craft-quality line.** The recipe detail shows one deterministic `Quality: {Tier}` line (tier word in its craft color) with a hint of what would raise it, no odds bar and no percent. Check once recipes exist.
- [ ] **The craft validate-before-mutate fix.** Every refused craft (missing materials, essence too weak, essence not on hand, a reagent in two slots with one on hand, an essence with an unknown or no reagent, no station) leaves the inventory and gold unchanged. Covered by `craft_quality.test.ts`; check live once recipes exist.
- [ ] **Salvage confirmations.** A common unequipped item salvages at once; any other rarity asks `Salvage {name}? It breaks down into materials. This can't be undone.` with Keep it focused first; an equipped piece asks `Salvage {name}? It's unequipped first, then broken down into materials. This can't be undone.` Keep it and Esc send nothing.
- [ ] **Sell all junk preview.** The confirmation states the junk count and the gold before anything is sold, Keep it is the safe default, and the button is disabled (`No junk to sell`) with none. Needs at least one junk item.
- [ ] **The two guard-test edits.** (a) 50-17: `src/frame/frameContract.test.ts` ("every width media query is exactly the 900px pair") now also allows `(min-width: 1200px)`, the column-switch tier that the Inventory, Stats, Trade and Crafting screens use (commit `eb70deed`); the 900px shell switch is unchanged. (b) 50-22: `src/styles/designContract.test.ts` applies its icon-library pattern to package specifiers only, because the word `material` in `./MaterialsOnHand.vue` tripped it (commit `5e9e3b48`; `@iconify/vue` is still flagged and a relative `./MaterialsOnHand.vue` passes). Check that neither relaxation hides a real violation when Phase 51 revisits the styling.
- [ ] **Notice-line icons.** The warning icon is used only for client rejections, because server refusals and info lines share one event kind (so a refusal reads with the info icon). The line has no always-present live region (50-13 note): if a screen reader does not announce it, the fix is a zero-height always-present container.
- [ ] **Perk names for generated passives** are humanized from the stored key (punctuation lost); exact names would need a stored perk name.
- [ ] **Renown passive perks still have no effect** (todo `.planning/todos/pending/2026-10-06-renown-passive-perks-no-effect.md`), so the rapport `and renown` suffix rarely shows.
- [ ] **Vendor listing price ignores quality when bought** (For sale rows use the template rarity); buy and sell do not check vendor proximity (buy-back does).
- [ ] **Unequip, craft and salvage have no server bag-full gate**; the client gates them.
- [ ] **Equipped salvage sends unequip then salvage** (assumption A1): if the cache had not updated when the first call settled, the salvage is skipped. Check live that salvaging an equipped piece works first time.
- [ ] **Subscription size** (assumption A2): the template and affix OR chains grow with the bag. Check a full bag (50 stacks) of rolled items.
- [ ] **The Phase 45 frame tests changed copy.** The old `No vendor nearby.` / `Close Vendor` expectations are replaced by `No vendor here.` (with `Find a vendor in Nearby, then choose Trade.`) and `Close Trade`; nothing else in the shell tests changed.
- [ ] **Live run of all four screens at 1280 and 390x844**, including buy-back (sell, buy back, wrong place after travel, full bag) and the craft refusal-is-free fix once recipes exist.
- [ ] **Publish evidence.** See `50-09-SUMMARY.md`: local only, `--break-clients`, key length 108 before and after, only the buy-back bindings changed.

## Phase 52 note (what to reuse)

Phase 52 (owner decisions 2026-10-06) builds the designed loot rails (UWR Combat), the bank (UWR Bank), the admin screens (UWR Admin Screens) and player trade (UWR Party). Phase 50 left these pieces to reuse rather than rebuild:

- **Item tiles and item facts:** `src/ledger/ItemTile.vue` (props `instance`, `template`, `selected`, `mobile`, `tabindex`; emits `select`) and `src/ledger/itemModel.ts` (`itemName`, `itemRarity`, `nameColor`, `ringColor`, `itemCategory`, `itemIcon`, `slotLabel`, `compareBagItems`, `RARITY_ORDER`). Loot lists, bank slots and trade offers should draw items with these so rarity, junk and quest rules read the same everywhere.
- **The inspector:** `src/inventory/Inspector.vue` (props `instanceId`, `variant` `'card' | 'dock'`, `runner`; emits `close`) over the pure `src/inventory/inspector.ts` (`inspectorView`, `salvagePrompt`, `dockSummary`) and `src/ledger/compare.ts` for the up and down comparison. A bank or trade offer can show the same card for an item.
- **The backpack model and grid:** `src/inventory/backpack.ts` (`slotUsage`, `bagTiles`, `filterBag`, the four filters) and `BackpackGrid.vue` (roving-tabindex grid, 44px targets) for any "your backpack" column (bank deposit side, trade offer side). Capacity and the slot rule come from `@game-data/inventory_rules`; do not copy them.
- **The hub:** `src/ledger/ledgerContext.ts` (`LEDGER_KEY`, `LedgerData`, `createInertLedger`, `LedgerReducers`) and `ledgerData.ts` / `queries.ts` (filtered subscriptions keyed to the character and the open vendor). Add bank rows and trade offers here as new bindings, and new reducers to `LedgerReducers`, rather than growing `gameData.ts`. Mount tests against the inert default.
- **The action runner and notice line:** `src/ledger/actionRunner.ts` (`createActionRunner`, one in-flight action per key, `SEND_ERROR_TEXT`) and `NoticeLine.vue` (private `system`/`reward`/`heal` entries as text, `role="status"`).
- **Shared controls:** `InlineConfirm.vue` (safe default Keep it, focus return, Esc), `SegTabs.vue`, `FilterChips.vue`, `GoldAmount.vue`, `src/screens/EmptyState.vue`.
- **The frame hooks:** a screen is one `SCREENS` entry with `component` and optional `meta` (rendered in the drawer and sheet `#meta` slot); a screen opens with arguments through `FrameControls.openScreen(id, args)` and `screenArgs` (today only `npcId` and `npcName`, used by Trade). A bank screen opened from a banker, or a trade opened from a player, can extend `ScreenArgs` the same way. The registry test (`screens.test.ts`) and the frame tests show how to mount a new screen bare and in the shells; the 1200px column tier is already allowed by the frame guard.
- **The vendor pieces for bank and trade parity:** `vendorModel.ts` (`buyPrice`, `sellPayout`, rapport, reasons), `SellPanel.vue`, `JustSold.vue` (a per-sender view row driving a card), and the server rule modules shared through `@game-data` (`item_rules`, `item_stats`, `item_usability`, `vendor_pricing`, `perk_rules`, `faction_rules`, `crafting_rules`). The buy-back table and its `my_vendor_buyback` per-sender view are the pattern for any private per-character row a client must read (never a public table).
- **Local facts to keep in mind:** the local world now has two regions with a vendor and a banker each (Orrin Sill and Cormorant Stair), so a bank screen can be tried without new seed data.

## Deviations from Plan

**1. [Rule 1 - Bug in a test expectation] `src/frame/frameControls.test.ts` expected the vendor drawer title `Vendor`**
- **Found during:** Task 1 regression run (the plan's read_first did not list this file)
- **Issue:** "opens the vendor screen with its arguments" asserted `h4` text `Vendor`; the drawer is now titled Trade.
- **Fix:** one expectation changed to `Trade`. **Commit:** `a0e9beff`.

**2. [Process] The placeholder deletions were committed by a concurrent commit**
- I ran `git rm` on the four placeholders; before my own commit, the orchestrator's docs commit `f2367ed9` (a ROADMAP edit) swept the staged deletions into it. The deletions are therefore in `f2367ed9`, and the registry, test and import changes are in `a0e9beff`. The tree at `a0e9beff` is the intended one (no file imports a deleted placeholder; vue-tsc and the suites pass).

**3. [Interpretation] The plan's STATE.md and ROADMAP.md steps were skipped** at the orchestrator's instruction; the plan itself does not edit them.

**4. [Interpretation] The VALIDATION latency box stays unticked** (see Validation map), so the sign-off is honest about the 223 s whole-suite run.

None otherwise: the registration, tests, deletions, gate and documents follow the plan.

## Known Stubs

None. (Map, Social and World events remain Phase 45 placeholders by design; they are outside Phase 50.)

## Threat Flags

None. T-50-74 (only SELECT queries were run against the live database), T-50-75 (no live action, no reducer call; the try-out list warns about the paid perk generation) and T-50-76 (frame regression tests ran with the registry change; full client suite and build green) hold.

## Task commits

1. `a0e9beff` register the four Ledger screens with meta and the Trade title (the placeholder deletions rode in `f2367ed9`, see Deviations)
2. Validation map and this SUMMARY: the final docs commit

## Self-Check: PASSED

- FOUND: src/screens/screens.ts (imports the four screens and meta; `title: 'Trade'` once), src/screens/screens.test.ts, src/frame/AppFrame.screens.test.ts, 50-VALIDATION.md (`nyquist_compliant: true`)
- MISSING as intended: src/screens/InventoryScreen.vue, StatsScreen.vue, VendorScreen.vue, CraftingScreen.vue
- FOUND commits: a0e9beff, f2367ed9
