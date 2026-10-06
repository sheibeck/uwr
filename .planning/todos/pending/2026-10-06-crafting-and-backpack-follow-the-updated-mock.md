---
created: 2026-10-06T22:30:00Z
title: Crafting and backpack follow the updated mock (UWR Crafting)
area: ui
files:
  - src/inventory/BackpackGrid.vue:203-213
  - src/crafting/CraftingScreen.vue
  - src/crafting/RecipeDetail.vue
  - src/crafting/craftingModel.ts
  - src/inventory/Inspector.vue
  - spacetimedb/src/data/recipe_rules.ts:596
  - spacetimedb/src/reducers/items_crafting.ts
---

## Problem

The owner play-tested the Phase 50 screens on 2026-10-06 and sent an updated crafting mock. Six points:

1. **Backpack squares are huge.** `BackpackGrid.vue` uses `repeat(6, minmax(0, 1fr))` with `aspect-ratio: 1`, so the slots stretch to fill the column width. The owner wants them smaller, sized as in the mock.
2. **Quality odds bar.** The owner asked why we did not follow the mock's bar showing the likely chance of each quality. (Answered in chat: on 2026-10-06 the owner chose "show the one craft result, no odds bar", because the server decides quality from the material tier with no randomness. An odds bar would show made-up odds unless quality becomes random, which is a balance change. The new mock may revisit this; ask the owner before changing it.)
3. **Craft and salvage results are buried.** The result message appears low in the bottom-left corner. The owner wants a clear message saying what was crafted, salvaged and so on.
4. **Craft multiple is missing.** The mock shows a quantity modifier (×N) next to the Craft button.
5. **The output has no real description.** For example, Herbal Draught lists its ingredients, but the crafted item shows no description. Generated recipe outputs get only `Crafted from {primary} and {secondary}.` (`recipe_rules.ts:596`). The recipe detail should show what the item is and does, with its stats (armor, damage, healing, effects and so on), like the inventory inspector.
6. **Implement the updated mock**, `UWR Crafting.dc.html`.

## Solution

**Design source** (re-import fresh when this is planned; never cached):
- claude_design MCP (`https://api.anthropic.com/v1/design/mcp`, auth via `/design-login`). Project "Unwritten Realms" (id `1a7a975f-7b14-488b-9a38-188bc56294cf`): https://claude.ai/design/p/1a7a975f-7b14-488b-9a38-188bc56294cf?file=UWR+Crafting.dc.html
- Focus file: `UWR Crafting.dc.html`. Also read `_ds/nocturne-67cd9946-e94d-4ca6-a321-43b2d8edbd8f/_ds_bundle.js`, `_ds/nocturne-67cd9946-e94d-4ca6-a321-43b2d8edbd8f/styles.css` and `support.js`.
- Implement `UWR Crafting.dc.html`. Take the backpack slot size from the Ledger mock and the crafting file.

**Approach hints:**
- **Backpack:** use fixed-size square slots from the mock instead of `1fr`, keeping 44px touch targets on mobile and the slot-count and filter behaviour.
- **Result feedback:** show a clear result after Craft, Salvage and similar actions, near the action and following the mock (for example a result card or banner with the item name, quality and quantity, or the materials returned). Keep the feed line. Screen readers get a polite live region.
- **Craft multiple:** a ×N stepper next to Craft. The maximum is how many the materials allow, and the server stays the authority. Either call `craft_recipe` N times in sequence, stopping at the first refusal, or add a `craft_recipe_times` reducer (additive). Decide in planning. Every refusal must leave the bag unchanged (validate-before-mutate, as fixed in Phase 50).
- **Output details:** the recipe detail shows the output item's stats through the shared `item_stats` and `inspector` helpers, and a real description. Whether generated outputs get rule-based descriptions from category and stats (no LLM, no prompt change) is decided in planning. Show the stats either way.
- **Odds bar:** keep the single deterministic "Quality: {Tier}" unless the owner decides otherwise after seeing the new mock.
- Design guards apply: no literal colors (the token pin stays 23), no v-html, no `<svg`, Phosphor and Inter only, sizes 10/12/14/20, weights 400/500, spacing 4/8/16/24/32/48/64, text nodes only. Mobile at 390×844.
- Tests: slot size contract, craft ×N (stops at the first refusal, max from materials), result message for craft and salvage, output stats shown for generated recipes.
