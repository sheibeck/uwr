---
phase: quick-7
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/index.ts
  - spacetimedb/src/reducers/items.ts
  - src/App.vue
  - src/components/VendorPanel.vue
  - src/composables/useCombat.ts
autonomous: true
must_haves:
  truths:
    - "Armor items display which classes can equip them in tooltips (inventory, vendor, and loot)"
    - "Server rejects equip attempts for class/armor mismatches with correct argument order"
    - "Armor seed data specifies actual class restrictions instead of 'any'"
  artifacts:
    - path: "spacetimedb/src/index.ts"
      provides: "Armor items seeded with proper allowedClasses per armor type"
      contains: "warrior,paladin"
    - path: "spacetimedb/src/reducers/items.ts"
      provides: "Fixed isArmorAllowedForClass call argument order"
      contains: "isArmorAllowedForClass(character.className, template.armorType)"
    - path: "src/App.vue"
      provides: "Vendor items include allowedClasses for tooltip display"
      contains: "allowedClasses"
    - path: "src/components/VendorPanel.vue"
      provides: "Vendor item type includes allowedClasses field"
      contains: "allowedClasses"
    - path: "src/composables/useCombat.ts"
      provides: "Loot items include allowedClasses and armorType for tooltip display"
      contains: "allowedClasses"
  key_links:
    - from: "spacetimedb/src/index.ts"
      to: "tooltips in App.vue"
      via: "allowedClasses field on ItemTemplate rows"
      pattern: "allowedClasses"
    - from: "spacetimedb/src/reducers/items.ts"
      to: "spacetimedb/src/data/class_stats.ts"
      via: "isArmorAllowedForClass(className, armorType) correct arg order"
      pattern: "isArmorAllowedForClass\\(character\\.className"
---

<objective>
Fix item class restrictions: update armor seed data to specify which classes can wear each armor type (instead of 'any'), fix the swapped `isArmorAllowedForClass` arguments in the equip reducer, and ensure vendor/loot tooltips display class restriction info.

Purpose: Players currently see no class restriction info on armor items in tooltips (inventory, vendor, loot), and the server-side armor proficiency check has swapped arguments making it silently pass all equip attempts. Both issues need fixing together.

Output: Properly restricted armor items with visible class info in all tooltip contexts, and correct server-side enforcement.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/4-equipment-of-any-type-is-currently-usabl/4-SUMMARY.md
@spacetimedb/src/data/class_stats.ts (CLASS_ARMOR map, isArmorAllowedForClass signature)
@spacetimedb/src/reducers/items.ts (equip_item reducer)
@spacetimedb/src/index.ts (ensureStarterItemTemplates seed data)
@src/composables/useInventory.ts (client-side CLASS_ARMOR, inventory item mapping)
@src/App.vue (tooltip display, vendorItems computed)
@src/components/VendorPanel.vue (vendor item type definition)
@src/composables/useCombat.ts (activeLoot computed)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix server-side armor enforcement and update armor seed data with proper class restrictions</name>
  <files>
    spacetimedb/src/reducers/items.ts
    spacetimedb/src/index.ts
  </files>
  <action>
**Fix swapped isArmorAllowedForClass arguments in equip_item reducer:**

In `spacetimedb/src/reducers/items.ts`, line ~272, the call is:
```
if (!isArmorAllowedForClass(template.armorType, character.className)) {
```
The function signature is `isArmorAllowedForClass(className, armorType)` -- arguments are SWAPPED. Fix to:
```
if (!isArmorAllowedForClass(character.className, template.armorType)) {
```
This is a critical bug: with swapped args, the armor proficiency check effectively passes for all combinations because `CLASS_ARMOR["plate"]` is undefined (defaults to `['cloth']`) and `normalizeArmorType("wizard")` returns `'cloth'` (not a valid armor type), so every check resolves to true.

**Update armor item seed data with proper allowedClasses:**

In `spacetimedb/src/index.ts`, in the `ensureStarterItemTemplates` function (~line 3228-3295), the armor items (chest, legs, boots for each armor type) all use `allowedClasses: 'any'`. Update them to specify the classes that can actually wear each armor type, using the CLASS_ARMOR map as source of truth:

- `plate` armor: `allowedClasses: 'warrior,paladin'`
- `chain` armor: `allowedClasses: 'warrior,paladin,ranger,shaman'`
- `leather` armor: `allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster'`
- `cloth` armor: `allowedClasses: 'any'` (all 16 classes can wear cloth, so keep 'any')

To implement this, create a helper map above the loop at ~line 3228:
```typescript
const ARMOR_ALLOWED_CLASSES: Record<string, string> = {
  plate: 'warrior,paladin',
  chain: 'warrior,paladin,ranger,shaman',
  leather: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster',
  cloth: 'any',
};
```

Then in each `upsertItemTemplateByName` call for armor pieces (chest, legs, boots), replace `allowedClasses: 'any'` with `allowedClasses: ARMOR_ALLOWED_CLASSES[armorType] ?? 'any'`.

Do NOT change weapon templates (they already have correct allowedClasses), accessories (correctly 'any'), junk (correctly 'any'), or any other item types.
  </action>
  <verify>
Run `npx vue-tsc --noEmit --project spacetimedb/tsconfig.json 2>&1 | head -5` (or equivalent) to check for TypeScript errors in the backend module. Grep for `isArmorAllowedForClass(character.className` in items.ts to confirm the fix. Grep for `ARMOR_ALLOWED_CLASSES` in index.ts to confirm the new map exists.
  </verify>
  <done>
The equip_item reducer calls `isArmorAllowedForClass(character.className, template.armorType)` with correct argument order. Armor seed data uses proper class restrictions: plate='warrior,paladin', chain='warrior,paladin,ranger,shaman', leather=9 classes, cloth='any'.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add allowedClasses and armorType to vendor and loot tooltip data</name>
  <files>
    src/App.vue
    src/components/VendorPanel.vue
    src/composables/useCombat.ts
  </files>
  <action>
**Add allowedClasses to vendorItems computed in App.vue:**

In `src/App.vue`, in the `vendorItems` computed (~line 737-748), the returned object is missing `allowedClasses`. Add it:
```typescript
return {
  id: row.id,
  templateId: row.itemTemplateId,
  price: row.price,
  name: template?.name ?? 'Unknown',
  rarity: template?.rarity ?? 'Common',
  tier: template?.tier ?? 1n,
  slot: template?.slot ?? 'misc',
  armorType: template?.armorType ?? 'none',
  allowedClasses: template?.allowedClasses ?? 'any',  // ADD THIS LINE
  description,
  stats,
};
```

**Add allowedClasses to VendorPanel vendorItems type:**

In `src/components/VendorPanel.vue`, in the `vendorItems` prop type definition (~line 94-105), add `allowedClasses: string;` after the existing `armorType: string;` line.

**Add allowedClasses and armorType to activeLoot computed in useCombat.ts:**

In `src/composables/useCombat.ts`, in the `activeLoot` computed (~line 203-210), the returned object is missing `allowedClasses` and `armorType`. Add both fields:
```typescript
return {
  id: row.id,
  name: template?.name ?? 'Unknown',
  rarity: template?.rarity ?? 'Common',
  tier: template?.tier ?? 1n,
  allowedClasses: template?.allowedClasses ?? 'any',  // ADD
  armorType: template?.armorType ?? 'none',            // ADD
  description,
  stats,
};
```

These additions ensure that the tooltip display in App.vue (which checks `tooltip.item?.allowedClasses` and `tooltip.item?.armorType`) will work for items shown in vendor and loot contexts, not just inventory items.
  </action>
  <verify>
Run `npx vue-tsc --noEmit 2>&1 | head -20` to check for TypeScript errors. Visually inspect that each of the three files now includes `allowedClasses` in their item data mappings.
  </verify>
  <done>
Vendor items include `allowedClasses` in both the computed data and VendorPanel type definition. Loot items include `allowedClasses` and `armorType`. Tooltips for vendor and loot items now show class restriction and armor type info matching inventory tooltip behavior.
  </done>
</task>

</tasks>

<verification>
1. Grep `isArmorAllowedForClass(character.className` in items.ts confirms correct argument order
2. Grep `ARMOR_ALLOWED_CLASSES` in index.ts confirms armor seed data uses class-specific restrictions
3. Grep `allowedClasses` in App.vue vendorItems computed confirms vendor tooltip data
4. Grep `allowedClasses` in VendorPanel.vue confirms type definition updated
5. Grep `allowedClasses` in useCombat.ts confirms loot tooltip data
6. `npx vue-tsc --noEmit` passes without new errors
</verification>

<success_criteria>
- Armor items in seed data specify proper class restrictions (plate=warrior,paladin; chain=4 classes; leather=9 classes; cloth=any)
- Server equip_item reducer correctly calls isArmorAllowedForClass(className, armorType) not (armorType, className)
- Vendor item tooltips show "Classes: warrior, paladin" for plate armor etc.
- Loot item tooltips show "Classes:" and "Armor:" lines
- TypeScript compilation passes
</success_criteria>

<output>
After completion, create `.planning/quick/7-we-ve-added-tooltips-to-show-class-restr/7-SUMMARY.md`
</output>
