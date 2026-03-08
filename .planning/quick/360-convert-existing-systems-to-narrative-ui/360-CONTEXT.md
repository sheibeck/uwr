# Quick Task 360: Convert Existing Systems to Narrative UI - Context

**Gathered:** 2026-03-08
**Status:** Ready for planning

<domain>
## Task Boundary

Convert all remaining game systems to inline narrative UI. No floating panels/popups — everything renders as narrative messages with clickable `{{color:#HEX}}[links]{{/color}}` in the console.

Systems to convert:
1. Travel region warnings (popup → narrative confirmation)
2. Loot pickup (clickable links in combat narrative + server decay timer + `loot` command)
3. Bank (inline narrative deposit/withdraw)
4. Vendor/Store (inline narrative buy/sell)
5. Crafting (inline narrative recipe discovery + crafting)
6. Stats/Equipment viewing (already partially done via `inventory`/`backpack` commands)
7. Resource harvesting (harvestable resources shown in location narrative)

</domain>

<decisions>
## Implementation Decisions

### Rendering Approach
- ALL inline in narrative console — no floating panels or popups
- Use existing pattern: server generates `{{color:#HEX}}[text]{{/color}}` links → client renders → clicks route through `window.clickNpcKeyword()` → intent reducer

### Loot Pickup
- Loot items appear as clickable colored links in combat results narrative
- Hybrid decay: server cleans up corpse loot after ~5 minutes
- Player can type `loot` to see remaining corpse loot before expiry
- Links are convenience shortcuts — loot exists until server timer expires

### Town Services (Bank, Vendor, Crafting)
- Narrative discovery: arriving in town/location narrates available services as clickable links
- Interacting with services is fully narrative — no popups
- Not tied to NPCs necessarily (town facilities), but NPCs can also be vendors

### Travel
- Already mostly handled
- Remaining: region movement cooldown warning — convert popup confirmation to narrative warning with confirmation link
- Resource harvesting at locations needs narrative integration

### Stats/Equipment
- Already works via `inventory`/`backpack` commands
- May need refinement for equip/unequip actions inline

### Claude's Discretion
- Specific formatting/layout of inline narrative displays
- Exact color choices for service links (bank, vendor, craft)
- Server-side corpse cleanup timer duration (suggested ~5 min)

</decisions>

<specifics>
## Specific Ideas

- Follow exact pattern from `intent.ts` for generating inline displays
- Use existing rarity colors for items in all contexts
- Bank: `{{color:#ffd43b}}[bank]{{/color}}` (gold, like bindstone)
- Vendor: `{{color:#f59e0b}}[shop]{{/color}}` or `{{color:#da77f2}}[NpcName]{{/color}}` for NPC vendors
- Crafting: `{{color:#f59e0b}}[craft]{{/color}}` (already exists in look command)
- Loot: Use item rarity colors for loot links in combat narrative

</specifics>
