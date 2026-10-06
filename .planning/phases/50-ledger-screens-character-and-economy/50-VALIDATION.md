---
phase: 50
slug: ledger-screens-character-and-economy
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-10-06
---

# Phase 50 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: 50-RESEARCH.md "## Validation Architecture". Owner decisions: server buy-back, quest-item refusal, single craft quality, `craft_recipe` validate-before-mutate fix (each refusal leaves the inventory unchanged).

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
| LDG-01 | category rule row by row (quest, junk, gear, food, recipe, material, other), rarity token with unknown = common, icon table, slot labels, bag sort order | unit | `pnpm exec vitest run src/ledger/itemModel.test.ts` | yes |
| LDG-01 | slot count excludes equipped, stack counts once, `Full` at cap, each filter's set, empty tiles only under All; capacity comes from `@game-data` | unit | `pnpm exec vitest run src/inventory/backpack.test.ts` | yes |
| LDG-01 | `MAX_INVENTORY_SLOTS` and `backpackSlotCount` helper; `EQUIPMENT_SLOTS` array equals the server Set | unit (server) | `cd spacetimedb && pnpm exec vitest run src/data/inventory_rules.test.ts` | yes |
| LDG-01 | desktop and mobile inventory render, roving-tabindex grid, tabs (arrows, Home, End), 44px targets, dock open and close with focus return | component | `pnpm exec vitest run src/inventory` | yes |
| LDG-02 | `sumItemStats` incl. affixes and craft-quality implicits; equals the examine output; differential against `getEquippedBonuses` on one fixture | unit (server) | `cd spacetimedb && pnpm exec vitest run src/data/item_stats.test.ts src/helpers/examine.test.ts` | yes |
| LDG-02 | comparison: up for positive, down for negative, none at zero, stat union shows losses, nothing equipped -> all up, no deltas for equipped or non-gear, screen-reader text | unit | `pnpm exec vitest run src/ledger/compare.test.ts` | yes |
| LDG-02 | `canEquipItem` equals the real `equip_item` handler's refusals (class, weapon, armor, stackable, slot); level reported but not a refusal | integration (real handler) | `cd spacetimedb && pnpm exec vitest run src/data/item_usability.test.ts src/reducers/item_rules_parity.test.ts` | yes |
| LDG-02 | inspector actions per item kind, Salvage hidden when not salvageable, common salvages at once, non-common and equipped confirm, equipped flow `unequip_item` then `salvage_item`, `Keep it` sends nothing, Use only for `USABLE_ITEM_KEYS` | component | `pnpm exec vitest run src/inventory/Inspector.test.ts` | yes |
| LDG-03 | bar `scaleMax`, base/gear split vs `getEquippedBonuses`, renown rank, name, progress incl. rank 15, `formatPermille` (150 -> `15.00%`), no Keeper's assessment in source | unit | `pnpm exec vitest run src/stats` | yes |
| LDG-03 | `factionTier` at every edge (100, 75, 50, 25, 24, -24, -25, -49, -50, -99, -100) and `standingLabel` agrees | unit | `cd spacetimedb && pnpm exec vitest run src/data/faction_rules.test.ts` and `pnpm exec vitest run src/input/infoCommands.test.ts` | yes |
| LDG-03 | `perkDisplayName` (pool key, prefixed key, humanized), owned perks from `renownPerks` plus Renown abilities, chooser sends `choose_renown_perk({ characterId, perkId })`, inert until chosen, lowest pending rank first | unit + component | `cd spacetimedb && pnpm exec vitest run src/data/perk_rules.test.ts` and `pnpm exec vitest run src/stats/PerkChooser.test.ts` | yes |
| LDG-08 | `buyPrice`, `sellPayout`, `rapport` equal the real `buy_item`, `sell_item`, `sell_all_junk` gold deltas (differential, real handlers) | integration (real handler) | `cd spacetimedb && pnpm exec vitest run src/data/vendor_pricing.test.ts src/reducers/vendor_pricing_parity.test.ts` | yes |
| LDG-08 | usable filter hides rows, All keeps Buy, can't-afford and full-bag reasons, rapport text with U+2212, vendor selection (Nearby id; More with one, several, none), vendor-left state | unit + component | `pnpm exec vitest run src/vendor` | yes |
| LDG-09 | sell then buy back restores item, affixes and gold; a second sale replaces the first; Sell all junk neither records nor changes the row; wrong owner (`Not your character`), not enough gold, wrong place, full bag, nothing to buy back each refuse and leave the row | integration (real handler) | `cd spacetimedb && pnpm exec vitest run src/reducers/vendor_buyback.test.ts` | yes |
| LDG-09 | `vendor_buyback` is not public; `my_vendor_buyback` returns only the sender's active character's row (two owners fixture) | schema + view | `cd spacetimedb && pnpm exec vitest run src/views/vendor_buyback.test.ts` | yes |
| LDG-09 | quest template refused with `Quest items can't be sold.` in `sell_item` and in `submit_intent` `sell`, `sell N`, `sell junk`; instance, gold and buy-back row unchanged | integration (real handler) | `cd spacetimedb && pnpm exec vitest run src/reducers/quest_item_sale.test.ts` | yes |
| LDG-09 | Just sold card renders from the view row only; button states (gold short, wrong place, full bag, pending, offline), `Buy back` object call, focus to heading, junk leaves the card | component | `pnpm exec vitest run src/vendor/JustSold.test.ts` | yes |
| LDG-09 | `delete_character` removes the buy-back row | integration | `cd spacetimedb && pnpm exec vitest run src/reducers/vendor_buyback.test.ts` | yes |
| LDG-10 | have/need uses the true bag count (same in list and detail), craftable rule, only-craftable filter (default off), category mapping with unknown -> All only, row order, empty states | unit | `pnpm exec vitest run src/crafting/craftingModel.test.ts` | yes |
| LDG-11 | `craftQualityForMaterialName` equals the quality the real `craft_recipe` stores (T1, T2, T3, unknown material); `nextCraftQuality`; hint copy; no hint at the top tier or for consumables | integration (real handler) | `cd spacetimedb && pnpm exec vitest run src/data/crafting_rules.test.ts src/reducers/craft_quality.test.ts` | yes |
| LDG-11 | reagent rules: essence gate by quality, slot count by quality, magnitude hint from `getModifierMagnitude`, essence without reagent disables Craft, reagent count cap; Craft sends only set ids; Discover calls `research_recipes`; station reasons | unit + component | `pnpm exec vitest run src/crafting` | yes |
| LDG-11 | owner fix: every `craft_recipe` refusal (missing materials, essence too weak, essence not on hand, a reagent in two slots with one on hand, an essence with an unknown reagent or none, no station, unknown or undiscovered recipe) leaves inventory and gold unchanged (validate before mutate) | integration (real handler) | `cd spacetimedb && pnpm exec vitest run src/reducers/craft_quality.test.ts` | yes |
| LDG-10 | recipe generation rules (plan 50-25): material kind mapping and vocabulary membership, area level and level growth, candidate order and counts, name walk, every output column, determinism, import-free pin | unit (server) | `cd spacetimedb && pnpm exec vitest run src/data/recipe_rules.test.ts` | yes |
| LDG-10 | `research_recipes` generation: three new recipes per Discover (cap), stored once and shared across characters, level band, short counts, unknown material names, no station, another owner's character | integration (real handler) | `cd spacetimedb && pnpm exec vitest run src/reducers/recipe_discovery.test.ts` | yes |
| LDG-11 | craft and eat of generated recipes: stated materials consumed, quality from the primary material, essence affix, food becomes a Well Fed effect for every food form, salvage writes no debug line, level 1 outputs equal the starter gear | integration (real handler) | `cd spacetimedb && pnpm exec vitest run src/reducers/recipe_discovery.test.ts` | yes |
| LDG-10 | generated recipes in the crafting model: rows per category tab, detail, Craft availability, food category | unit | `pnpm exec vitest run src/crafting/generatedRecipes.test.ts` | yes |
| shell | `trade(npc)` passes the NPC; `screenArgs` set and cleared; `watch` follows a second Trade; meta slot renders per screen; title `Trade`; More label stays `Vendor`; each tab and Bag opens the right screen with the right active tab | unit + component | `pnpm exec vitest run src/frame src/console/useConsole.test.ts src/rails` | yes (updated in 50-23) |
| notice | only private `system`/`reward`/`heal` entries not present at mount, text node, `role="status"`, clears on close, client rejection shows `Couldn't send that. Try again.` | component | `pnpm exec vitest run src/ledger/NoticeLine.test.ts` | yes |
| hub | queries SQL shapes (WHERE and OR chains, empty list refused), keys follow character and vendor target, inert default mounts bare | unit | `pnpm exec vitest run src/ledger/ledgerData.test.ts src/ledger/queries.test.ts` | yes |
| all | design guards over new files; img-onerror payload in item, vendor, faction, perk, recipe names, greeting and a notice line renders as text; `@game-data` modules import-free | static + component | `pnpm exec vitest run src/styles src/gameDataAlias.test.ts` | yes |

### Sampling Rate
- **Per task commit:** the quick command for the touched slice (client or server).
- **Per wave merge:** root full suite with `--maxWorkers=1` plus `pnpm exec vue-tsc -b`.
- **Phase gate:** full suite green (ignoring the baseline failures) and `pnpm build` (includes `scripts/check-bundle.mjs`) before `/gsd-verify-work`.

### Wave 0 Gaps
- [x] Server pure helpers first (everything imports them): `data/item_stats.ts`, `item_usability.ts`, `vendor_pricing.ts`, `perk_rules.ts`, `inventory_rules.ts`, `item_rules.ts`, additions to `faction_rules.ts` and `crafting_rules.ts`, each with a `*.test.ts`
- [x] Server real-handler files (harness copied from `creation_finalize.test.ts`: `capturedReducer`, `createMockCtx({ strict: true })`): `reducers/vendor_buyback.test.ts`, `quest_item_sale.test.ts`, `vendor_pricing_parity.test.ts`, `item_rules_parity.test.ts` (equip, use and salvage parity), `craft_quality.test.ts`; `views/vendor_buyback.test.ts`
- [x] Local publish with `--break-clients` and `pnpm spacetime:generate -y` before any client file imports `tables.myVendorBuyback` (done in 50-09; evidence in 50-09-SUMMARY.md)
- [x] Client pure models and tests: `src/ledger/{itemModel,compare,queries,ledgerData}`, `src/inventory/backpack`, `src/stats/{statsModel,format}`, `src/vendor/vendorModel`, `src/crafting/craftingModel`
- [x] Component tests: shared pieces (`SegTabs`, `FilterChips`, `InlineConfirm`, `NoticeLine`, `GoldAmount`, `ItemTile`), the four screens at desktop and mobile
- [x] Framework install: none

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Local publish of the buy-back table, view and reducer, the quest-item refusal and the craft reorder, with `--break-clients` and no clear; the stored key is unchanged | LDG-09, LDG-11 | Needs the owner's running local server (never maincloud) | Run `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null`. Check that `admin_llm_status` key_length is 108 before and after. Run `pnpm spacetime:generate -y` and expect only the new buy-back binding. |
| Live try-out of inventory, stats, vendor and crafting at 1280 and 390×844 | LDG-01..03, 08..11 | Needs real data; the local DB has no recipes or factions yet | Deferred to the end-of-milestone UAT; the try-out list is in the final plan SUMMARY |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [ ] Feedback latency < 60s (not met for the whole client suite, about 223 s at two workers; a single slice runs in 10 to 60 s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-10-06 (Plan 50-23 phase gate green)
