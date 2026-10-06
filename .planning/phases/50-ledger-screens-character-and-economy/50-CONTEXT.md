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
