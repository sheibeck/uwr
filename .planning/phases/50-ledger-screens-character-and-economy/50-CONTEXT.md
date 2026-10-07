# Phase 50: Ledger Screens: Character and Economy - Context

**Gathered:** 2026-10-06
**Status:** Ready for UI-SPEC and planning
**Mode:** Smart discuss. The owner answered the two open questions in chat on 2026-10-06. The rest are recommended defaults, which the owner may revise at UAT.

<domain>
## Phase Boundary

Players manage their gear, read their character's numbers, trade with vendors and craft. The screens are Ledger drawers on desktop and full-height sheets on mobile, built on the Phase 45 drawer and sheet shells and the `src/screens/` placeholders.

| Screen | Requirements | What it covers |
|--------|--------------|----------------|
| Inventory | LDG-01, LDG-02 | Equipment slots and the backpack, with filters, slot count, gold, and an item inspector (▲/▼ comparison, Equip / Salvage) |
| Stats | LDG-03 | Base stat bars with gear bonus, derived stats, renown rank with perk choice, faction standing |
| Vendor | LDG-08, LDG-09 | For-sale table with "usable by you" and Buy; sellables with Sell, Sell all junk and **buy back the last sale**; quest items unsellable |
| Crafting | LDG-10, LDG-11 | Materials on hand, recipe list with category tabs, "only craftable" filter, have versus need, quality odds, optional reagent or affix, Craft, Discover recipes |

Mobile (390×844): each screen opens as a full-height sheet above the tab bar. Bag opens the inventory.

**Out of scope:**
- The LLM "Keeper's assessment" on Stats (LDG-F1).
- Map, Social and World events (Phase 51).
- Balance changes.
- Keeper Bible and route-block changes.

</domain>

<decisions>
## Implementation Decisions

### Owner decisions (2026-10-06, in chat)
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

### Owner decisions after the UI-SPEC draft (2026-10-06, owner in chat)
- **Quest items are refused on the server too.** `sell_item` fails for quest items with `Quest items can't be sold.` This is a code-only change, published with the buy-back work, and it gets a test.
- **Craft quality shows the single deterministic result.** It reads `Quality: {Tier}`, with a hint for what would raise it. There is no odds bar and quality is not made random (no balance change).

### Owner decisions after research (2026-10-06, owner in chat)
- **Fix the `craft_recipe` validate-before-mutate bug in Phase 50.** Today a refused craft (essence too weak, reagent missing) has already consumed its inputs and added the output.
  - Reorder the reducer so every refusal comes before any mutation.
  - Add real-handler tests showing that each refusal leaves the inventory and gold unchanged.
  - Code only, published locally with the buy-back work. The client still pre-gates these cases.
- **Renown passive perks with no effect: todo for later, not this phase.** Chosen passives are stored as `renown_rank{N}_{key}`, which never matches `RENOWN_PERK_POOLS`. The Stats screen shows perk names correctly, and the bug is filed under `.planning/todos/pending/`.

### Owner decision after the build (2026-10-06, owner in chat): vendor base stock
- The owner said: "Vendors should sell what players sell to them and they should have a selection of items appropriate to the area."
- **Source.** Stock is chosen by rules from item templates that already exist in the world. There is no LLM call and no new prompt.
  - Each vendor stocks templates that suit its role, which research reads from the vendor NPC's existing data. Examples: a provisioner sells food, consumables and materials; a smith sells weapons and armor.
  - The selection also suits the area's level band (region or location danger and level).
  - Rarity is weighted toward common.
  - Nothing is pre-seeded: templates come from play and the starter set.
- **Restock.** Stock refills on a timer through a scheduled table, using the module-identity guard pattern. Player-sold listings stay as they are and are never removed by restock.
- **Determinism.** Selection is deterministic per vendor and restock tick, from ctx-based seeds, never `Math.random`.
- **Prices.** Prices come from the shared `vendor_pricing` (`buyPrice` with rapport). Buy-back and the quest-item refusal are unchanged.
- **Timing.** This is a Phase 50 follow-up (plan 50-24), built now, before Phase 51. It is a server change with real-handler tests. Publish locally only, with the key check before and after, and expect no binding change unless a new scheduled table is added (additive).
- **Later.** LLM-themed specialty stock is out of scope, unless the owner asks for it later.

### Owner decision after the build (2026-10-06, owner in chat): recipe generation
- **Problem.** The owner reported: "My Elfansworth character has a bunch of items in his bag, but I'm unable to discover any recipes." `recipe_template` is empty. `research_recipes` only reveals existing templates, and nothing generates them since the seeded recipes were removed (v2.0 "nothing pre-seeded").
- **Rule-based recipe generation, no LLM.** Using Discover recipes at a crafting station creates recipes from rules:
  - The materials the character carries decide the recipe.
  - Material kind maps to the item category. For example, ore and shards make weapons, cloth and hide make armor, and herbs and water make consumables. Research reads the actual mapping from existing data (`crafting_rules.ts`, material names and tiers, `mechanical_vocabulary.ts`).
  - Material tier sets quality, using the existing `materialTierToCraftQuality`.
  - The area's level band sets the output level.
- **Stored once and shared.** A generated recipe and its output `item_template` are stored once. Everyone who discovers it later reuses them, with no duplicates for the same material combination.
- **Discovery.** The discovering character gets a `recipe_discovered` row.
- **Determinism.** Generation is deterministic (ctx-based seeds, never `Math.random`). Names are built from rules: material plus item type words from the vocabulary, for example "Iron Shard Dagger" or "Herbal Draught". No LLM call and no prompt change.
- **Must work end to end.** A generated recipe passes the shared `planCraft` and `craft_recipe` checks and produces an item the Phase 50 screens can show.
- **Out of scope.** LLM naming and flavor is not built now. The owner can ask later.
- **Timing.** Phase 50 follow-up (plan 50-25), built after 50-24 (vendor base stock) and before Phase 51. Server change with real-handler tests. Publish locally only, checking the key before and after.

### Owner decision after the build (2026-10-06, owner in chat): finite vendor stock, price floor, sell quantity (plan 50-26)
- **The bug.** The owner wrote: "when I sell an item to a vendor, I can endlessly buy it back and it never goes out of stock."
  - `vendor_inventory` rows have no quantity. A listing is unlimited stock, so a sale plus repeated Buy duplicates items without limit. This is an economy exploit.
- **Finite stock.** Every vendor listing has a quantity.
  - A player sale adds the sold quantity to that vendor's listing for the same template and quality, or creates the listing with that quantity.
  - Base stock (50-24) gets a finite quantity per restock.
  - Buying lowers the quantity. At 0 the listing is removed, or hidden until restock for base stock.
  - Buy-back moves the item back out of the listing.
  - `buy_item` refuses when the quantity is short.
  - The client shows the quantity in the For sale table, for example "×3", plus a sold-out state.
  - Store the quantity with an additive schema change: either a new column with a default (if SpacetimeDB auto-migration supports it without a clear) or a companion table keyed by listing id. Research decides. Never use `--clear-database`.
- **Price floor.** In the owner's words: "they should always sell them back for more than you sold them for."
  - For any character, the buy price of a listing must be strictly greater than what that character would get for selling the same item and quality to that vendor.
  - This must hold after rapport, Charisma modifiers and perk discounts and bonuses.
  - Implement it once in the shared `data/vendor_pricing.ts`, as `buyPrice` with a floor of `sellPayout(...) + 1` or a fixed margin.
  - The rule applies to buy-back too: buy-back keeps its exact refund rule (the same price as the sale, per the earlier owner decision) and is the only exception, because it undoes the last sale.
  - Tests: every combination of rapport and perk gives buy > sell.
- **Sell quantity.** In the owner's words: "If I have a stack of items ask me how many to sell when I sell."
  - Selling a stack asks for a quantity: a small inline number picker with 1 / All and -/+ in the Sell panel, following the Phase 49 and 50 inline confirmation pattern.
  - `sell_item` gets a quantity argument. This is additive: a new reducer argument or a new reducer `sell_item_quantity`. Research picks one, and the bindings are regenerated.
  - A partial sale splits the stack.
  - Buy-back records exactly the quantity sold.
  - The typed `sell N <item>` path uses the same helper.
- **Timing.** This is a Phase 50 follow-up, plan 50-26, after 50-24 (base stock) and 50-25 (recipes), and before Phase 51.
  - The server change is additive, with real-handler tests: no infinite duplication, the floor holds, partial sales, buy-back quantity.
  - Publish locally only, with the key check before and after.

### Owner decision after play-testing (2026-10-06, owner in chat): crafting and backpack follow the updated mock (plans 50-28 onward)
- The owner sent a new mock, `UWR Crafting.dc.html` (claude_design project `1a7a975f-7b14-488b-9a38-188bc56294cf`), and asked to implement it. The fresh import and extract are in the session scratchpad `design50b/EXTRACT.md`. Todo: `.planning/todos/pending/2026-10-06-crafting-and-backpack-follow-the-updated-mock.md`.
- **Timing:** build it now as a Phase 50 follow-up, before Phase 51 planning (owner chose "Now, as Phase 50 follow-up").
- **Backpack squares are too big.** `BackpackGrid.vue` stretches slots with `1fr`. Use the mock slot size; keep 44px touch targets on mobile.
- **Clear result message.** Craft, Salvage and similar actions show a clear result saying what was made, salvaged or returned, placed as the mock shows, not only a feed line low in the corner. Screen readers get a polite live region.
- **Craft multiple.** Add the ×N quantity control next to Craft from the mock. Its maximum is what the materials allow. The server stays the authority, and every refusal leaves the bag unchanged.
- **Output details.** The recipe detail shows what the output item is and does, with its stats (shared `item_stats` and inspector helpers) and a real description. Generated outputs today only say `Crafted from {primary} and {secondary}.`
- **Updated inventory mock (owner, same day):** `UWR Inventory.dc.html` shows salvaging with a result window. Implement it in the same follow-up (backpack, inspector, salvage confirm and result window). Extract: `design50b/EXTRACT.md`.
- **No odds bar (owner re-confirmed).** Quality stays deterministic from the material tier: show `Quality: {Tier}` with the hint, styled to the new mock. No random quality and no balance change.
- **Defaults where the mocks and the game differ (Claude, 2026-10-06; owner may revise at UAT):**
  - **Result card:** one shared result card for Crafted, Salvaged and Discover recipes: a centered card over the drawer on desktop and a bottom sheet on mobile. Done and Esc close it and focus returns to the opener. A polite live region is added. The card shows exactly what the server did, so the server writes a per-character result row (private table plus a `my_*` view, one row replaced per action) rather than the client guessing from inventory changes. Card actions are offered only where a reducer exists (Craft again, Equip, Open crafting). Add to hotbar and Read scroll appear only if existing reducers support them.
  - **Craft ×N:** one click crafts the whole quantity through a new additive reducer that takes a count, capped at 99 and at what the materials allow. It is all or nothing: validate the whole batch before changing anything. The stepper has −/+ and Max, as the mock shows.
  - **Quality words:** keep the server tier names. The mock's Plain/Standard/Fine are placeholders.
  - **Salvage in Crafting:** add the Craft/Salvage switch from the mock, using the same salvage reducer and rules as Inventory.
  - **Equipped items:** follow the mock. Equipped items cannot be salvaged ("unequip first"); the client disables it and the server refuses it too.
  - **Confirm step:** keep the salvage confirm on mobile too (the Phase 50 rule for non-common, crafted, affixed items), even though the mobile mock skips it.
  - **Reagent picker:** use the mock's single "Add Essence + reagent" slot, which opens the existing picker. Keep the full functionality.
  - **Categories:** follow the recipe categories the server actually generates. The mock's tabs are a guide.
  - **Bonus and "Recipe found" tags:** show them only when the server reports them.
  - **Off-scale values:** map the mock's off-scale sizes and spacing to the nearest allowed value, as in Phase 50.
  - **Stack count:** follow the Inventory mock ("x14" top-right, including "x1"). Use a 6px gap if the guard allows it; otherwise use the nearest allowed spacing.

- Any server change is additive, publishes locally only with the key check (108) before and after, never clears the database, and comes with real-handler tests. No prompt changes.

### Owner decision after play-testing (2026-10-07, owner in chat): inventory header and bag grid (plan 50-39)
- **Header, as in mock 10a:** "Inventory", the "{used} / {capacity} slots" count, gold, and an **Organize** button (`ph-sort-ascending`) next to the gold.
- **Organize merges stacks and sorts.** It calls the existing `consolidate_stacks` reducer to merge partial stacks, then orders the bag by type, then rarity (best first), then name.
- **The bag shows every slot.** It draws all capacity slots, with empty ones visible, and the grid fills the backpack column's width.
- **Capacity stays 50 (owner):** "Keep 50, show #/50". The counter reads, for example, `22 / 50`, and 50 slots are drawn. There is no server cap change.
- **Slightly bigger tiles.** 50-32 capped them at 58px desktop, which the owner says is slightly too small. Make them a bit bigger, around 64px at 1280, with the column count chosen to fill the width. Keep the 44px minimum and the mobile size.

### Screens and shells
- Each screen fills the Phase 45 drawer (desktop) or sheet (mobile) for its `ActiveScreen` value, replacing the placeholder. Opening and closing, focus trap and Esc stay as Phase 45 built them.
- The Nearby vendor action from Phase 47 opens the Vendor screen for that NPC. Crafting is reached from the existing screen entry points. Phase 45 tabs, Bag and More decide which screen opens on mobile.
- The design source is the inventory, stats, vendor and crafting screens in `UWR Ledger Screens.dc.html`, desktop and mobile. Re-import it fresh from the claude_design MCP project "Unwritten Realms" (never cached).

### Data and server reuse (confirm in research)
- **Existing reducers to reuse:** equip and unequip, `salvage_item`, `sell_item`, `sell_all_junk`, `buy_item`, `research_recipes` (Discover recipes), craft, and the renown perk choice. Research confirms exact names and arguments.
- **Rapport modifiers and crafting quality odds:**
  - Use existing server data, imported through `@game-data` where possible. Never duplicate server constants on the client (memory rule: the server is the source of truth).
  - If a value exists only inside a server helper that imports `spacetimedb/server`, move the pure math into `spacetimedb/src/data/` (import-free). This is the same pattern Phase 49 used for `race_bonuses.ts`.
- **Derived stats** use the same pure math the server uses, shared the same way.
- **Item comparison** (▲/▼) compares the selected item's stats with the item equipped in the same slot. Affix and craft-quality bonuses are included, matching the a3d examine helper's per-instance stat sum.
- **Quest items** are marked unsellable and have no Sell button. The server refusal stays the source of truth.
- **Usable by you** means the item's armor or weapon category and required level fit the active character. The rule comes from existing server data.

### Recommended defaults (owner may revise at UAT)
- **Salvage confirmation:** salvaging an item above common rarity, or an equipped item, asks once first, reusing the Phase 49 Start over confirmation pattern. Common items salvage straight away.
- **Sell all junk** shows how many items it will sell and for how much gold before it runs.
- **Inventory filters:** All, Gear, Materials, Food, as the requirement says. The slot count shows used out of capacity.
- **Faction standing** shows every faction the character has standing with, as a bar per faction with a tier label.
- **Renown perk choice** reuses the existing reducer, and shows only when a choice is pending.

### Claude's Discretion
- Component layout under `src/screens/` or new `src/inventory`, `src/stats`, `src/vendor` and `src/crafting` folders.
- Exact table and sort behavior where the design doesn't specify it.
- How to split the plans. Execution is sequential on the main checkout.

</decisions>

<code_context>
## Existing Code Insights

- **Phase 45:** Drawer, Sheet, useScreens, the `ActiveScreen` and `SCREENS` lists, TabBar and MoreSheet, plus the screen placeholders under `src/screens/`.
- **Phase 47:** keyed bindings (`createKeyed`, filtered subscriptions in `src/game/gameData.ts` and `queries.ts`), inert defaults in `context.ts`, NearbyList vendor action, and the feed and console.
- **Quick a0i:** con colors and the enemy rows pattern.
- **Quick a3d:** per-instance item stat sum (template plus affixes) in `spacetimedb/src/helpers/examine.ts`. The comparison math should share a pure version of it.
- **Phase 49:**
  - The `@game-data` shared-helper pattern (`spacetimedb/src/data/race_bonuses.ts`).
  - The confirmation pattern (Start over or Keep my choices).
  - Real-handler server tests (the `llm_cutover.test.ts` harness).
- **Old client at tag `v2.2-client`:** a behavior reference only (inventory, vendor, crafting and stats panels).

### Established Patterns
- **Design guards:** enforced by the existing tests (`designContract`, `colors.guard`, `tokens.client`, `scrollbars`).
  - no literal colors, no `v-html`, no `<svg`
  - Phosphor icons and Inter only
  - font sizes 10/12/14/20, weights 400/500
  - spacing 4/8/16/24/32/48/64
  - no new tokens; the pin stays 23
  - text nodes only, with the img-onerror escape test
  - no `replaceAll`, `.at` or `Object.hasOwn`
- **Server changes:** additive only. Publish locally with `--break-clients`, never clear the database, and check the key before and after.
- **Reducer calls:** object syntax.

</code_context>

<specifics>
## Specific Ideas
- The owner wants buy-back to protect against misclicks.
- After the build, tell the owner what is ready to try on the running local stack (Vite hot reload plus the local publish).

</specifics>

<deferred>
## Deferred Ideas
- The Keeper's assessment on Stats (LDG-F1).
- The live UAT of all four screens, at the end-of-milestone UAT pass.

</deferred>
