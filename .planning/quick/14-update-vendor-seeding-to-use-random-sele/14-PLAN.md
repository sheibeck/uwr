---
phase: quick-14
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/index.ts
autonomous: true
must_haves:
  truths:
    - "Vendor stocks a random subset of tier-appropriate items, not one-of-everything"
    - "Vendor at Hollowmere only stocks Tier 1 items"
    - "Vendor inventory includes a mix of item categories (some weapons, some armor, consumables) not all of one type"
    - "Vendor inventory is deterministic per-vendor (same NPC always produces same selection for a given seed)"
  artifacts:
    - path: "spacetimedb/src/index.ts"
      provides: "Updated ensureVendorInventory function with random subset selection and tier filtering"
      contains: "ensureVendorInventory"
  key_links:
    - from: "spacetimedb/src/index.ts (ensureVendorInventory)"
      to: "VendorInventory table"
      via: "insert/update vendor inventory rows"
      pattern: "vendorInventory\\.insert"
---

<objective>
Update the `ensureVendorInventory` function to stock vendors with a random subset of common items instead of every non-junk item in the database. Vendors should only stock items matching their region/location tier.

Purpose: Currently vendors display an overwhelming wall of every single item in the game. This makes the vendor feel like a debug tool rather than a real shop. A curated random selection creates a more believable vendor experience and naturally gates item availability by region tier.

Output: Modified `ensureVendorInventory` in `spacetimedb/src/index.ts`
</objective>

<context>
@.planning/STATE.md
@spacetimedb/src/index.ts (lines 4220-4247 — current ensureVendorInventory)
@spacetimedb/src/index.ts (lines 142-156 — Npc table with locationId)
@spacetimedb/src/index.ts (lines 100-124 — Region and Location tables)
@spacetimedb/src/index.ts (lines 674-686 — VendorInventory table)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite ensureVendorInventory with tier-filtered random subset selection</name>
  <files>spacetimedb/src/index.ts</files>
  <action>
Rewrite the `ensureVendorInventory` function (lines ~4220-4247) with the following logic:

1. **Iterate ALL vendor NPCs** (not just the first one). Change from `.find()` to `.filter()` on `npcType === 'vendor'`.

2. **For each vendor NPC, determine its tier** from its location's region:
   - Look up the vendor's `locationId` -> get the Location row -> get `regionId` -> get the Region row
   - Derive tier from `dangerMultiplier`: tier = Math.floor(dangerMultiplier / 100). So Hollowmere Vale (100) = Tier 1, Embermarch Fringe (160) = Tier 1, Embermarch Depths (200) = Tier 2.
   - Use `Math.max(1, tier)` to ensure minimum tier of 1.

3. **Filter eligible items** for this vendor:
   - Must NOT be junk (`isJunk === false`)
   - Must NOT be a resource (`slot !== 'resource'`)
   - Item `tier` must be <= vendor tier (so Tier 1 vendor stocks only tier 1 items)
   - This leaves: armor (cloth/leather/chain/plate x chest/legs/boots), weapons, accessories, consumables, food, utility items

4. **Group eligible items into categories** for balanced selection:
   - `armor`: items where slot is chest, legs, or boots
   - `weapons`: items where slot is mainHand or offHand
   - `accessories`: items where slot is earrings, cloak, or neck
   - `consumables`: items where slot is consumable, food, or utility

5. **Select a random subset from each category** using deterministic pseudo-random selection based on the vendor's NPC id (like the codebase already does with `ctx.timestamp.microsSinceUnixEpoch + someId`):
   - Use `vendor.id` as the seed component (NOT timestamp, since ensureVendorInventory is called on sync and we want stable inventory)
   - For each category, pick a target count:
     - `armor`: 4 items (out of ~12 total)
     - `weapons`: 3 items (out of ~8 total)
     - `accessories`: 2 items (out of ~5 total)
     - `consumables`: ALL consumable/food/utility items (these are always useful, keep them all — bandages, rations, etc.)
   - Selection algorithm for each non-consumable category:
     ```
     function pickN(items, n, seed) {
       const selected = [];
       const pool = [...items];
       for (let i = 0; i < Math.min(n, pool.length); i++) {
         const idx = Number((seed + BigInt(i * 7)) % BigInt(pool.length));
         selected.push(pool.splice(idx, 1)[0]);
       }
       return selected;
     }
     ```
   - Use `vendor.id` as the seed value for `pickN`.

6. **Upsert the selected items** into VendorInventory (same upsert pattern as current code).

7. **Remove stale vendor items** — after upserting the selected items, delete any VendorInventory rows for this vendor whose `itemTemplateId` is NOT in the selected set. This handles the transition from "everything" to "subset" on existing databases.

8. Keep the pricing formula unchanged: `price = template.vendorValue > 0n ? template.vendorValue * 6n : 10n`

**Important notes:**
- Reducers must be deterministic. Do NOT use `Math.random()`. Use the NPC id as seed for stable, deterministic selection.
- Do NOT use `ctx.timestamp` in the seed — inventory would change every time sync runs. Use `vendor.id` only so the same vendor always stocks the same items.
- The function signature stays the same — `function ensureVendorInventory(ctx: any)`.
  </action>
  <verify>
    1. `spacetime publish uwr --project-path spacetimedb` compiles without errors
    2. After publish, call `sync_equipment_tables` reducer — vendor inventory should have ~13-15 items instead of ~50+
    3. Check `spacetime logs uwr` for no errors
    4. Open the game client, visit Quartermaster Jyn — vendor should show a manageable subset of items with mixed categories
  </verify>
  <done>
    - ensureVendorInventory iterates all vendor NPCs, not just the first
    - Each vendor's tier is derived from its region's dangerMultiplier
    - Items are filtered by tier and grouped by category
    - A deterministic random subset is selected per category (armor: 4, weapons: 3, accessories: 2, consumables: all)
    - Stale vendor items from the old "everything" approach are cleaned up
    - Vendor inventory is stable across multiple sync calls (same vendor always stocks same items)
  </done>
</task>

</tasks>

<verification>
- Module compiles and publishes successfully
- Vendor shows a curated subset (~13-15 items) instead of all ~50+ items
- All item categories are represented (armor, weapons, accessories, consumables)
- Running sync_equipment_tables multiple times produces the same vendor inventory (deterministic)
- No stale items from old seeding remain
</verification>

<success_criteria>
- Quartermaster Jyn stocks approximately 13-15 items with mixed categories instead of every item in the game
- Only Tier 1 items appear (matching Hollowmere Vale region)
- Consumables (bandages, rations, potions, food) are always available
- Equipment selection is random but stable per vendor NPC
</success_criteria>

<output>
After completion, create `.planning/quick/14-update-vendor-seeding-to-use-random-sele/14-SUMMARY.md`
</output>
