---
phase: quick-137
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/seeding/ensure_items.ts
  - spacetimedb/src/seeding/ensure_enemies.ts
  - spacetimedb/src/reducers/combat.ts
autonomous: true

must_haves:
  truths:
    - "Jewelry (earrings/neck slot items) can drop as world loot from enemies"
    - "Jewelry drops at roughly 20% the rate of weapons/armor (weight 1n vs 6n)"
    - "Jewelry rolled as 'common' quality is silently upgraded to 'uncommon' before affix assignment"
    - "Vendor inventories include world-drop jewelry as accessories (existing ensureVendorInventory logic already handles neck/earrings slots)"
  artifacts:
    - path: "spacetimedb/src/seeding/ensure_items.ts"
      provides: "World-drop jewelry templates (earrings + neck slots, tier 1 and tier 2)"
      contains: "ensureWorldDropJewelryTemplates"
    - path: "spacetimedb/src/seeding/ensure_enemies.ts"
      provides: "Loot table entries for jewelry with weight 1n"
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Quality floor: jewelry slot rolls that land on 'common' are bumped to 'uncommon'"
  key_links:
    - from: "ensureWorldDropJewelryTemplates"
      to: "ensureLootTables"
      via: "jewelry templates visible to iter() filter in ensureLootTables"
    - from: "generateLootTemplates"
      to: "quality floor"
      via: "slot check on picked template before rollQualityTier result is used"
---

<objective>
Add jewelry (earrings and neck slots) to the world-drop loot pool with two special rules:
jewelry drops at ~20% the weight of normal gear, and jewelry always rolls at least 'uncommon'
quality (the 'common' tier is bypassed).

Purpose: Give players exciting accessory drops with a meaningful rarity floor while keeping
jewelry rare enough that it feels special rather than cluttering every kill.
Output: New jewelry item templates seeded, wired into loot tables at reduced weight, quality
floor enforced in combat loot generation.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/seeding/ensure_items.ts
@spacetimedb/src/seeding/ensure_enemies.ts
@spacetimedb/src/reducers/combat.ts
@spacetimedb/src/helpers/items.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add world-drop jewelry templates and wire into seeding</name>
  <files>spacetimedb/src/seeding/ensure_items.ts</files>
  <action>
Add a new exported function `ensureWorldDropJewelryTemplates(ctx: any)` at the bottom of
ensure_items.ts (before the last blank lines), using the same `upsertByName` helper pattern
already used in `ensureWorldDropGearTemplates`.

Jewelry templates to add (use slots 'earrings' and 'neck', armorType 'none', allowedClasses
'any', stackable false, weaponBaseDamage/weaponDps 0n, armorClassBonus 0n):

Tier 1 (requiredLevel: 1n, tier: 1n):
- { name: 'Copper Band', slot: 'earrings', vendorValue: 6n, stat: strBonus 1n }
- { name: 'Iron Signet', slot: 'earrings', vendorValue: 6n, stat: dexBonus 1n }
- { name: 'Tarnished Loop', slot: 'earrings', vendorValue: 6n, stat: intBonus 1n }
- { name: 'Stone Pendant', slot: 'neck', vendorValue: 6n, stat: wisBonus 1n }
- { name: 'Bone Charm', slot: 'neck', vendorValue: 6n, stat: hpBonus 3n }
- { name: 'Frayed Cord', slot: 'neck', vendorValue: 6n, stat: manaBonus 3n }

Tier 2 (requiredLevel: 11n, tier: 2n):
- { name: 'Silver Band', slot: 'earrings', vendorValue: 16n, stat: strBonus 2n }
- { name: 'Arcane Loop', slot: 'earrings', vendorValue: 16n, stat: intBonus 2n }
- { name: 'Ember Pendant', slot: 'neck', vendorValue: 16n, stat: wisBonus 2n }
- { name: 'Vitality Cord', slot: 'neck', vendorValue: 16n, stat: hpBonus 6n }

All jewelry uses rarity: 'common' in the template row (the quality floor is applied at
loot-generation time, not in the seed data).

Also call `ensureWorldDropJewelryTemplates(ctx)` from within the `ensure_items` reducer
(wherever `ensureWorldDropGearTemplates` is called — find the call site in index.ts or
wherever the ensure functions are invoked, and add the new call immediately after it).

To find the call site: grep for `ensureWorldDropGearTemplates` in
`spacetimedb/src/index.ts` and add the import + call there.
  </action>
  <verify>
After publish: `spacetime logs uwr` shows no errors. The templates exist in DB (run
`spacetime sql uwr "SELECT name, slot, tier FROM item_template WHERE slot IN ('earrings','neck') AND name NOT IN ('Rough Band','Traveler Necklace','Glimmer Ring')"` and confirm 10 rows).
  </verify>
  <done>
10 world-drop jewelry templates exist in item_template table (6 tier-1, 4 tier-2), all with
slot earrings or neck, distinct from starter accessories.
  </done>
</task>

<task type="auto">
  <name>Task 2: Lower jewelry loot weight and apply quality floor</name>
  <files>
    spacetimedb/src/seeding/ensure_enemies.ts
    spacetimedb/src/reducers/combat.ts
  </files>
  <action>
**In ensure_enemies.ts — `ensureLootTables` function:**

The loop at line 81–83 currently gives all gear items weight `item.rarity === 'uncommon' ? 3n : 6n`.
Jewelry slots (earrings and neck) should get weight `1n` regardless of rarity, making them
appear at roughly 1/6 the rate of common gear items (close to the target of ~20% overall).

Change the loop body from:
```typescript
for (const item of gearTemplates) {
  upsertLootEntry(tableId, item.id, item.rarity === 'uncommon' ? 3n : 6n);
}
```
to:
```typescript
const JEWELRY_SLOTS = new Set(['earrings', 'neck']);
for (const item of gearTemplates) {
  const weight = JEWELRY_SLOTS.has(item.slot) ? 1n : (item.rarity === 'uncommon' ? 3n : 6n);
  upsertLootEntry(tableId, item.id, weight);
}
```

Define `JEWELRY_SLOTS` as a `const` inside `addOrSyncTable` (where it is used) or at the top
of `ensureLootTables` — either works since it is a pure constant. Place it just before the
for loop.

**In combat.ts — `generateLootTemplates` function:**

After `const quality = rollQualityTier(enemyTemplate.level ?? 1n, seedBase);` (around line
619), add a quality floor for jewelry slots:

```typescript
const JEWELRY_SLOTS_COMBAT = new Set(['earrings', 'neck']);
const effectiveQuality = (JEWELRY_SLOTS_COMBAT.has(template.slot) && quality === 'common')
  ? 'uncommon'
  : quality;
```

Then replace all subsequent uses of `quality` in that block with `effectiveQuality`:
- The `if (quality !== 'common')` check → `if (effectiveQuality !== 'common')`
- `generateAffixData(template.slot, quality, seedBase)` → `generateAffixData(template.slot, effectiveQuality, seedBase)`
- `lootItems.push({ template, qualityTier: quality, ... })` → `lootItems.push({ template, qualityTier: effectiveQuality, ... })`
- `lootItems.push({ template, qualityTier: 'common', ... })` → `lootItems.push({ template, qualityTier: effectiveQuality, ... })`

Note: `JEWELRY_SLOTS_COMBAT` is defined inside `generateLootTemplates` (the closure) since
it is only needed there. Keep it as a `const` local variable directly above the quality line.

After both changes, publish the module:
```
spacetime publish uwr --project-path spacetimedb
```

Watch logs: `spacetime logs uwr` — confirm no TypeScript or runtime errors.
  </action>
  <verify>
1. `spacetime logs uwr` shows clean publish with no errors.
2. Kill several enemies and check loot — jewelry pieces should appear occasionally (less
   frequently than weapons/armor).
3. Any jewelry loot that drops should never be labeled 'common' — it will be 'uncommon' or
   better.
4. `spacetime sql uwr "SELECT weight FROM loot_table_entry lte JOIN item_template it ON it.id = lte.item_template_id WHERE it.slot IN ('earrings','neck') LIMIT 5"` — all rows show weight = 1.
  </verify>
  <done>
Jewelry items appear in loot drops at reduced frequency (weight 1 vs 6 for normal gear).
Any jewelry drop has quality tier uncommon or higher — no common jewelry is awarded.
  </done>
</task>

</tasks>

<verification>
1. All 10 jewelry templates exist in item_template with correct slot/tier values.
2. Loot table entries for earrings/neck items all have weight = 1.
3. Killing enemies with loot tables active can produce jewelry drops.
4. Jewelry quality is always at least uncommon (never common).
5. Existing gear (weapons, armor) drop rates and quality rolls are unaffected.
6. Module published without errors.
</verification>

<success_criteria>
- 10 world-drop jewelry templates seeded (6 tier-1 earrings/neck, 4 tier-2)
- Loot table weight for jewelry = 1n (vs 3n-6n for weapons/armor)
- Quality floor enforced: earrings/neck slots never yield 'common' quality from loot
- Module published cleanly to local server
</success_criteria>

<output>
After completion, create `.planning/quick/137-add-jewelry-to-world-drop-loot-tables-wi/137-SUMMARY.md`
</output>
