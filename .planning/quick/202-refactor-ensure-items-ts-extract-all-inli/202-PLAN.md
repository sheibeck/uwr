---
phase: quick-202
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/item_defs.ts
  - spacetimedb/src/data/crafting_materials.ts
  - spacetimedb/src/seeding/ensure_items.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "Adding a new item requires editing only one data file (item_defs.ts or crafting_materials.ts), not ensure_items.ts"
    - "ensure_items.ts contains no inline item data — only loops over imported constants"
    - "All existing item names, stats, AC values, descriptions, and game balance are preserved exactly"
    - "Healer's Porridge is driven by CONSUMABLE_RECIPES; the extraFoodItems array is removed"
    - "spacetime publish compiles without errors after the refactor"
  artifacts:
    - path: "spacetimedb/src/data/item_defs.ts"
      provides: "All extracted item data constants"
      exports:
        - ARMOR_ALLOWED_CLASSES
        - STARTER_ARMOR_DESCS
        - STARTER_WEAPON_DEFS
        - STARTER_ACCESSORY_DEFS
        - JUNK_DEFS
        - RESOURCE_DEFS
        - WORLD_DROP_GEAR_DEFS
        - WORLD_DROP_JEWELRY_DEFS
        - CRAFTING_BASE_GEAR_DEFS
    - path: "spacetimedb/src/data/crafting_materials.ts"
      provides: "CONSUMABLE_RECIPES now includes Healer's Porridge"
    - path: "spacetimedb/src/seeding/ensure_items.ts"
      provides: "Pure seeding logic with no inline item data"
  key_links:
    - from: "spacetimedb/src/seeding/ensure_items.ts"
      to: "spacetimedb/src/data/item_defs.ts"
      via: "import { ARMOR_ALLOWED_CLASSES, STARTER_ARMOR_DESCS, STARTER_WEAPON_DEFS, STARTER_ACCESSORY_DEFS, JUNK_DEFS, RESOURCE_DEFS, WORLD_DROP_GEAR_DEFS, WORLD_DROP_JEWELRY_DEFS, CRAFTING_BASE_GEAR_DEFS }"
    - from: "spacetimedb/src/seeding/ensure_items.ts"
      to: "spacetimedb/src/data/crafting_materials.ts"
      via: "existing CONSUMABLE_RECIPES import (already present)"
---

<objective>
Refactor ensure_items.ts to extract all inline item data into data files following the pattern already established by CONSUMABLE_RECIPES and MATERIAL_DEFS. After this refactor, adding a new item requires editing only one data file, not hunting through ensure_items.ts for the correct upsertByName call.

Purpose: Developer experience — clear separation between "what items exist" (data files) and "how items are seeded" (ensure_items.ts). The seeding logic stays; only the data moves.
Output: New spacetimedb/src/data/item_defs.ts with all extracted constants, Healer's Porridge added to CONSUMABLE_RECIPES, and ensure_items.ts replaced with loops over imported data.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/seeding/ensure_items.ts
@spacetimedb/src/data/crafting_materials.ts
@spacetimedb/src/helpers/items.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create spacetimedb/src/data/item_defs.ts with all extracted data arrays</name>
  <files>spacetimedb/src/data/item_defs.ts</files>
  <action>
Create a new file `spacetimedb/src/data/item_defs.ts` that exports ALL item data currently inline in ensure_items.ts. Do NOT change any item names, stats, AC values, descriptions, allowed classes, vendor values, or any game balance values — copy them exactly.

Export the following typed constants:

**ARMOR_ALLOWED_CLASSES** — `Record<string, string>` mapping armor type to allowed classes string. Exact values from ensure_items.ts lines 100-105:
```
plate: 'warrior,paladin,bard,cleric'
chain: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver'
leather: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid'
cloth: 'any'
```

**STARTER_ARMOR_DESCS** — `Record<string, string>` mapping armor type to description. Exact values from lines 107-112.

**StarterWeaponDef interface** and **STARTER_WEAPON_DEFS** — typed array with fields `{ name, allowed, weaponType, description }`. Exact 8 entries from lines 187-201 (Training Sword through Training Rapier).

**StarterAccessoryDef interface** and **STARTER_ACCESSORY_DEFS** — typed array with fields `{ name, slot, rarity, stat: Partial<Record<StatKey, bigint>>, description }`. Exact 5 entries from lines 231-237 (Rough Band through Shaded Cloak). Use `type StatKey = 'strBonus'|'dexBonus'|'chaBonus'|'wisBonus'|'intBonus'|'hpBonus'|'manaBonus'` for the stat partial.

**JunkDef interface** and **JUNK_DEFS** — typed array with fields `{ name, vendorValue, description }`. Exact 4 entries from lines 265-270 (Rat Tail through Ashen Bone).

**ResourceDef interface** and **RESOURCE_DEFS** — typed array with fields `{ name, slot, vendorValue, description }`. Exact 20 entries from lines 460-480 (Flax through Root Vegetable). All have `slot: 'resource'`.

**WorldDropItemDef interface** with fields:
```typescript
export interface WorldDropItemDef {
  name: string;
  slot: string;
  armorType: string;
  rarity: string;
  tier: bigint;
  requiredLevel: bigint;
  vendorValue: bigint;
  allowedClasses: string;
  armorClassBonus?: bigint;
  weaponType?: string;
  weaponBaseDamage?: bigint;
  weaponDps?: bigint;
  strBonus?: bigint;
  dexBonus?: bigint;
  chaBonus?: bigint;
  wisBonus?: bigint;
  intBonus?: bigint;
  hpBonus?: bigint;
  manaBonus?: bigint;
  description: string;
}
```

**WORLD_DROP_GEAR_DEFS: WorldDropItemDef[]** — all items from ensureWorldDropGearTemplates (lines 317-379). Include only non-zero stat fields where they differ from zero (all weapon stat bonuses are 0n anyway, so omit them; include weaponType/weaponBaseDamage/weaponDps for weapons and armorClassBonus for armor). Order: T1 weapons (8), T2 weapons (8 — Oak Staff through Tempered Blade in file order), T1 cloth armor (3), T1 leather armor (3), T1 chain armor (3), T1 plate armor (3), T2 cloth armor (3), T2 leather armor (3 — Ranger Jerkin/Leggings/Boots), T2 chain armor (3), T2 plate armor (3). Copy exact names, vendorValues, allowedClasses, armorClassBonus, weaponBaseDamage, weaponDps, descriptions from the source.

**WORLD_DROP_JEWELRY_DEFS: WorldDropItemDef[]** — all items from ensureWorldDropJewelryTemplates (lines 400-421). Include stat bonus fields only where non-zero. Order: T1 earrings (3), T1 necks (3), T2 earrings (2), T2 necks (2), T1 cloaks (3), T2 cloaks (2). All cloaks have `slot: 'neck'` and `armorType: 'cloth'`. Copy exact values.

**CraftingBaseGearDef interface** with fields `{ name, slot, armorType, rarity, tier, isJunk, vendorValue, requiredLevel, allowedClasses, armorClassBonus, description }` and **CRAFTING_BASE_GEAR_DEFS: CraftingBaseGearDef[]** — all items from ensureCraftingBaseGearTemplates (lines 835-866). Order: Iron Helm, Leather Bracers, Iron Gauntlets, Rough Girdle, Wooden Shield, Simple Cloak, Cloth Hood, Cloth Wraps, Cloth Gloves, Cloth Sash, Leather Cap, Leather Gloves, Chain Coif, Chain Bracers, Chain Gauntlets, Chain Girdle, Plate Vambraces, Plate Girdle. Copy exact values.
  </action>
  <verify>
Run `cd /c/projects/uwr/spacetimedb && npx tsc --noEmit 2>&1 | head -30` to confirm the new file compiles without TypeScript errors.
  </verify>
  <done>
`spacetimedb/src/data/item_defs.ts` exists and exports all 9 constants (ARMOR_ALLOWED_CLASSES, STARTER_ARMOR_DESCS, STARTER_WEAPON_DEFS, STARTER_ACCESSORY_DEFS, JUNK_DEFS, RESOURCE_DEFS, WORLD_DROP_GEAR_DEFS, WORLD_DROP_JEWELRY_DEFS, CRAFTING_BASE_GEAR_DEFS) with exact data matching the source. TypeScript compilation passes.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add Healer's Porridge to CONSUMABLE_RECIPES in crafting_materials.ts</name>
  <files>spacetimedb/src/data/crafting_materials.ts</files>
  <action>
Append one new entry to the `CONSUMABLE_RECIPES` array in `spacetimedb/src/data/crafting_materials.ts`. Add it as the last entry in the array (after the Forager's Salad entry on line 257, before the closing `]`).

The entry must exactly match the Healer's Porridge data currently inline in ensure_items.ts (line 511-516):
```typescript
{
  key: 'healers_porridge',
  name: "Healer's Porridge",
  outputName: "Healer's Porridge",
  outputCount: 1n,
  req1Name: 'Herbs',
  req1Count: 2n,
  req2Name: 'Clear Water',
  req2Count: 1n,
  description: 'A soothing oat porridge infused with restorative herbs. Boosts health regeneration while Well Fed.',
  outputSlot: 'food',
  outputVendorValue: 3n,
  foodBuff: { buffType: 'health_regen', magnitude: 1n, durationMicros: 2_700_000_000n },
}
```

The wellFedDurationMicros (2_700_000_000n), wellFedBuffType ('health_regen'), wellFedBuffMagnitude (1n), outputVendorValue (3n) must match the inline values in ensure_items.ts exactly.
  </action>
  <verify>
Run `cd /c/projects/uwr/spacetimedb && npx tsc --noEmit 2>&1 | head -30` to confirm no TypeScript errors. Also confirm the entry is present: `grep -n "healers_porridge" spacetimedb/src/data/crafting_materials.ts`.
  </verify>
  <done>
CONSUMABLE_RECIPES has 15 entries (was 14). The healers_porridge entry is present with req1Name='Herbs', req1Count=2n, req2Name='Clear Water', req2Count=1n, and foodBuff matching the existing inline data. TypeScript compiles cleanly.
  </done>
</task>

<task type="auto">
  <name>Task 3: Refactor ensure_items.ts to import from item_defs.ts and replace all inline data with loops</name>
  <files>spacetimedb/src/seeding/ensure_items.ts</files>
  <action>
Update `spacetimedb/src/seeding/ensure_items.ts` to import from `../data/item_defs` and replace all inline data with loops over the imported constants. The seeding logic (upsertByName helpers, DB insert/update patterns) stays unchanged. Only the inline data arrays and records are removed and replaced with imports.

**Import line to add** (add to the existing import block near line 4):
```typescript
import {
  ARMOR_ALLOWED_CLASSES,
  STARTER_ARMOR_DESCS,
  STARTER_WEAPON_DEFS,
  STARTER_ACCESSORY_DEFS,
  JUNK_DEFS,
  RESOURCE_DEFS,
  WORLD_DROP_GEAR_DEFS,
  WORLD_DROP_JEWELRY_DEFS,
  CRAFTING_BASE_GEAR_DEFS,
} from '../data/item_defs';
```

**ensureStarterItemTemplates** (lines 75-297):
- Remove the inline `ARMOR_ALLOWED_CLASSES` Record (lines 100-105) — now imported
- Remove the inline `STARTER_ARMOR_DESC` Record (lines 107-112) — replaced by imported `STARTER_ARMOR_DESCS`
- Update line 115 reference: `STARTER_ARMOR_DESC[armorType]` → `STARTER_ARMOR_DESCS[armorType]`
- Remove the inline `weaponTemplates` Record (lines 187-201)
- Replace `for (const weapon of Object.values(weaponTemplates))` with `for (const weapon of STARTER_WEAPON_DEFS)`
- Remove the inline `accessoryTemplates` array (lines 231-237)
- Replace `for (const template of accessoryTemplates)` with `for (const template of STARTER_ACCESSORY_DEFS)`
- Remove the inline `junkTemplates` array (lines 265-270)
- Replace `for (const junk of junkTemplates)` with `for (const junk of JUNK_DEFS)`

**ensureWorldDropGearTemplates** (lines 299-380):
- Remove all individual `upsertByName(...)` calls (lines 318-379)
- Replace with a single loop:
```typescript
for (const item of WORLD_DROP_GEAR_DEFS) {
  upsertByName({
    ...item,
    isJunk: false,
    strBonus: item.strBonus ?? 0n,
    dexBonus: item.dexBonus ?? 0n,
    chaBonus: item.chaBonus ?? 0n,
    wisBonus: item.wisBonus ?? 0n,
    intBonus: item.intBonus ?? 0n,
    hpBonus: item.hpBonus ?? 0n,
    manaBonus: item.manaBonus ?? 0n,
    armorClassBonus: item.armorClassBonus ?? 0n,
    weaponBaseDamage: item.weaponBaseDamage ?? 0n,
    weaponDps: item.weaponDps ?? 0n,
    stackable: false,
  });
}
```

**ensureWorldDropJewelryTemplates** (lines 382-422):
- Remove all individual `upsertByName(...)` calls (lines 401-421)
- Replace with a single loop over `WORLD_DROP_JEWELRY_DEFS` using the same spreading pattern as above.

**ensureResourceItemTemplates** (lines 424-494):
- Remove the inline `resources` array (lines 459-480)
- Replace `for (const resource of resources)` with `for (const resource of RESOURCE_DEFS)`

**ensureFoodItemTemplates** (lines 496-563):
- Remove the `extraFoodItems` array (lines 509-517)
- Remove the `const foodItems = [...recipeFoodItems, ...extraFoodItems]` line
- Replace `for (const food of foodItems)` with `for (const food of recipeFoodItems)` (Healer's Porridge is now in CONSUMABLE_RECIPES so recipeFoodItems already includes it)

**ensureCraftingBaseGearTemplates** (lines 807-867):
- Remove all individual `upsertByName(...)` calls (lines 836-866)
- Replace with a single loop:
```typescript
for (const item of CRAFTING_BASE_GEAR_DEFS) {
  upsertByName(item);
}
```
(The `upsertByName` helper in this function already spreads defaults for zero-value fields via the `fullRow` spread pattern, so passing the def object directly works.)

After the edits, ensure_items.ts should have NO inline item data arrays/records — only imports, helper functions, and loops.
  </action>
  <verify>
1. `cd /c/projects/uwr/spacetimedb && npx tsc --noEmit 2>&1` — must show zero errors
2. `grep -n "weaponTemplates\|accessoryTemplates\|junkTemplates\|extraFoodItems\|ARMOR_ALLOWED_CLASSES\s*=" spacetimedb/src/seeding/ensure_items.ts` — must return no results (all inline declarations removed)
3. `grep -c "upsertByName({" spacetimedb/src/seeding/ensure_items.ts` — should return a very small number (only the helper function definitions, no data calls)
  </verify>
  <done>
ensure_items.ts imports all data from item_defs.ts, contains no inline item data arrays or records, all seeding functions use loops over imported constants, and `npx tsc --noEmit` passes with zero errors.
  </done>
</task>

</tasks>

<verification>
After all 3 tasks:
1. `cd /c/projects/uwr/spacetimedb && npx tsc --noEmit` — zero TypeScript errors
2. `wc -l spacetimedb/src/data/item_defs.ts` — should be ~250+ lines containing all the extracted data
3. `grep -c "const.*=\s*\[" spacetimedb/src/seeding/ensure_items.ts` — should return 0 (no inline arrays declared)
4. `grep "healers_porridge" spacetimedb/src/data/crafting_materials.ts` — should return a match
5. `grep "extraFoodItems" spacetimedb/src/seeding/ensure_items.ts` — should return nothing
</verification>

<success_criteria>
- spacetimedb/src/data/item_defs.ts exists and exports 9 named constants covering all previously-inline item data
- CONSUMABLE_RECIPES in crafting_materials.ts has a healers_porridge entry (15 total entries)
- ensure_items.ts has no inline item data — only imports, upsert helper functions, and for-loops over imported arrays
- All item names, stats, AC values, vendor values, allowed classes, and descriptions are byte-for-byte identical to the originals
- TypeScript compilation passes with zero errors
</success_criteria>

<output>
After completion, create `.planning/quick/202-refactor-ensure-items-ts-extract-all-inli/202-SUMMARY.md`
</output>
