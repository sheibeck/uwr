---
phase: quick-130
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/seeding/ensure_enemies.ts
  - spacetimedb/src/seeding/ensure_items.ts
autonomous: true
must_haves:
  truths:
    - "Vendors do not stock Training Sword, Training Mace, Training Staff, Training Bow, Training Dagger, Training Axe, Training Blade, Training Rapier or any starter armor pieces"
    - "World-drop tier 1 weapons are only marginally better than starter gear (+1 base damage, +1 dps over starter)"
    - "World-drop tier 1 armor pieces each have exactly +1 AC over their equivalent starter armor piece"
  artifacts:
    - path: "spacetimedb/src/seeding/ensure_enemies.ts"
      provides: "STARTER_ITEM_NAMES at module scope, ensureVendorInventory filtered to exclude them"
    - path: "spacetimedb/src/seeding/ensure_items.ts"
      provides: "World-drop gear stats tuned to +1 over starter"
  key_links:
    - from: "ensureVendorInventory (ensure_enemies.ts)"
      to: "STARTER_ITEM_NAMES set"
      via: "module-level constant referenced in allEligible filter"
      pattern: "STARTER_ITEM_NAMES"
---

<objective>
Remove starter gear from vendor inventories and tune world-drop common gear stats to be only +1 better than starter gear.

Purpose: Vendors should sell items players actually want to upgrade to, not the same training gear new characters already receive. World-drop commons should create a small motivation to kill enemies in early zones.
Output: Updated ensure_enemies.ts (vendor filter) and ensure_items.ts (world-drop stats).
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/seeding/ensure_enemies.ts
@spacetimedb/src/seeding/ensure_items.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Exclude starter items from vendor inventories</name>
  <files>spacetimedb/src/seeding/ensure_enemies.ts</files>
  <action>
Move `STARTER_ITEM_NAMES` from inside `ensureLootTables` to module scope (top of file, after imports) so both functions can share it. Then add `!STARTER_ITEM_NAMES.has(row.name)` to the `allEligible` filter inside `ensureVendorInventory`.

Specifically:
1. Cut the `const STARTER_ITEM_NAMES = new Set([...])` block from line 8-20 inside `ensureLootTables` and paste it at module scope before `ensureLootTables`.
2. In `ensureVendorInventory`, change line 135-136 from:
   ```ts
   const allEligible = [...ctx.db.itemTemplate.iter()].filter(
     (row) => !row.isJunk && row.slot !== 'resource' && row.tier <= BigInt(vendorTier)
   );
   ```
   to:
   ```ts
   const allEligible = [...ctx.db.itemTemplate.iter()].filter(
     (row) => !row.isJunk && row.slot !== 'resource' && row.tier <= BigInt(vendorTier) && !STARTER_ITEM_NAMES.has(row.name)
   );
   ```

The `ensureLootTables` function already uses `STARTER_ITEM_NAMES` and will continue to work since it will now reference the module-level constant. No other changes needed in that function.

Also add the accessory starter items to STARTER_ITEM_NAMES — the current set doesn't include them, and they should not appear in vendor inventories either:
- 'Rough Band', 'Worn Cloak', 'Traveler Necklace', 'Glimmer Ring', 'Shaded Cloak'

These are the starter accessories from `ensureStarterItemTemplates` in ensure_items.ts.
  </action>
  <verify>Grep for `STARTER_ITEM_NAMES` in ensure_enemies.ts — should appear at module scope (before any export function) and inside both `ensureLootTables` and `ensureVendorInventory`'s filter.</verify>
  <done>STARTER_ITEM_NAMES is a module-level const; ensureVendorInventory allEligible filter includes `!STARTER_ITEM_NAMES.has(row.name)`; ensureLootTables continues to reference same constant.</done>
</task>

<task type="auto">
  <name>Task 2: Tune world-drop tier 1 gear stats to +1 over starter</name>
  <files>spacetimedb/src/seeding/ensure_items.ts</files>
  <action>
In `ensureWorldDropGearTemplates`, update the tier 1 world-drop items in `ensure_items.ts` to be exactly +1 better than the equivalent starter gear.

Starter weapon baseline: `weaponBaseDamage: 4n, weaponDps: 6n`
Target for ALL tier 1 world-drop weapons: `weaponBaseDamage: 5n, weaponDps: 7n`

Update these weapons (currently over-tuned):
- Iron Shortsword: 6/9 → 5/7
- Hunting Bow: 5/8 → 5/7
- Worn Mace: 6/8 → 5/7
- Rusty Axe: 7/9 → 5/7
- Notched Rapier: 5/8 → 5/7

Keep Gnarled Staff (4/7→5/7 — actually needs base bump), Chipped Dagger (4/7→5/7 — base bump), Cracked Blade (5/8→5/7 — dps drop):
- Gnarled Staff: 4/7 → 5/7 (bump base by 1)
- Chipped Dagger: 4/7 → 5/7 (bump base by 1)
- Cracked Blade: 5/8 → 5/7 (drop dps by 1)

Starter armor baseline by slot and type:
- cloth: chest 3, legs 2, boots 1
- leather: chest 4, legs 3, boots 2
- chain: chest 5, legs 4, boots 3
- plate: chest 6, legs 5, boots 4

World-drop tier 1 armor currently matches starter exactly. Add +1 AC to each:
- Worn Robe (cloth chest): 3 → 4
- Worn Trousers (cloth legs): 2 → 3
- Worn Slippers (cloth boots): 1 → 2
- Scuffed Jerkin (leather chest): 4 → 5
- Scuffed Leggings (leather legs): 3 → 4
- Scuffed Boots (leather boots): 2 → 3
- Dented Hauberk (chain chest): 5 → 6
- Dented Greaves (chain legs): 4 → 5
- Dented Sabatons (chain boots): 3 → 4
- Battered Cuirass (plate chest): 6 → 7
- Battered Greaves (plate legs): 5 → 6
- Battered Boots (plate boots): 4 → 5

Do not change tier 2 items (Silken Robe, Ranger Jerkin, Steel Longsword, Yew Bow, Oak Staff) — those are already correctly tiered for level 11+.
  </action>
  <verify>
Check the updated values by reading the file. Confirm all tier 1 world-drop weapons show `weaponBaseDamage: 5n, weaponDps: 7n`. Confirm all tier 1 world-drop armor pieces each show armorClassBonus exactly 1 higher than starter equivalent.
  </verify>
  <done>All tier 1 world-drop weapons at 5/7 base/dps. All tier 1 world-drop armor +1 AC over starter equivalents. Tier 2 items unchanged.</done>
</task>

<task type="auto">
  <name>Task 3: Publish and verify</name>
  <files></files>
  <action>
Publish the module with a regular (non-clear) publish to pick up the seeding changes:

```bash
spacetime publish uwr --project-path C:/projects/uwr/spacetimedb
```

The `ensureVendorInventory` function runs during seeding and will re-stock all vendors, removing starter items automatically. The `ensureWorldDropGearTemplates` upserts by name so it will update existing item template rows with corrected stats.

If publish fails due to schema changes, report the error — do not use --clear-database without confirmation.
  </action>
  <verify>Run `spacetime logs uwr` and confirm no errors. Optionally check with spacetime CLI that the module published successfully.</verify>
  <done>Module published. Vendor inventories re-seeded without starter gear. World-drop gear stats corrected.</done>
</task>

</tasks>

<verification>
After publish:
- Starter gear names (Training Sword, Scout Jerkin, Apprentice Robe, Warden Hauberk, Vanguard Cuirass, etc.) must NOT appear in any vendorInventory row
- Tier 1 world-drop weapons all have weaponBaseDamage=5, weaponDps=7
- Tier 1 world-drop armor pieces each have +1 AC over starter equivalent
</verification>

<success_criteria>
Vendors sell only consumables, food, utilities, accessories, and world-drop gear. Starter items are exclusively granted at character creation. World-drop common gear is a small but meaningful upgrade over starter.
</success_criteria>

<output>
After completion, create `.planning/quick/130-remove-starter-gear-from-vendor-inventor/130-SUMMARY.md`
</output>
