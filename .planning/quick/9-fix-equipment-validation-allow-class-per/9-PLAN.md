---
phase: quick-9
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/items.ts
autonomous: true
must_haves:
  truths:
    - "Druid can equip Training Staff (weapon with armorType 'none' and allowedClasses including 'druid')"
    - "Armor proficiency check still blocks armor types not allowed for the class (e.g., druid cannot equip plate chest)"
    - "Error message for blocked armor says 'Armor type not allowed' and for blocked weapon says 'Weapon type not allowed'"
  artifacts:
    - path: "spacetimedb/src/reducers/items.ts"
      provides: "Fixed equip_item reducer with weapon-aware validation"
      contains: "Weapon type not allowed"
  key_links:
    - from: "spacetimedb/src/reducers/items.ts"
      to: "spacetimedb/src/data/class_stats.ts"
      via: "isArmorAllowedForClass import"
      pattern: "isArmorAllowedForClass"
---

<objective>
Fix equip_item reducer to skip armor proficiency check for weapon slots (mainHand, offHand) and improve error messages.

Purpose: Weapons have armorType='none' which is never in CLASS_ARMOR lists, so ALL weapons fail the isArmorAllowedForClass check. Weapons already have class restrictions via the allowedClasses field checked by isClassAllowed, so the armor proficiency check should only apply to actual armor slots. Error messages should distinguish armor vs weapon type restrictions.

Output: Fixed equip_item reducer that correctly allows class-permitted weapons.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/reducers/items.ts (equip_item reducer, lines 252-285)
@spacetimedb/src/data/class_stats.ts (isArmorAllowedForClass, CLASS_ARMOR, ARMOR_TYPES)
@spacetimedb/src/index.ts (EQUIPMENT_SLOTS definition around line 1505)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix equip_item validation to skip armor check for weapon slots and improve error messages</name>
  <files>spacetimedb/src/reducers/items.ts</files>
  <action>
In the `equip_item` reducer (around line 269-274), modify the armor proficiency check to only apply when the item is NOT a weapon slot.

Current code (lines 269-274):
```
if (!isClassAllowed(template.allowedClasses, character.className)) {
  return failItem(ctx, character, 'Class cannot use this item');
}
if (!isArmorAllowedForClass(character.className, template.armorType)) {
  return failItem(ctx, character, 'Armor type not allowed for this class');
}
```

Replace with:
```
if (!isClassAllowed(template.allowedClasses, character.className)) {
  const isWeaponSlot = template.slot === 'mainHand' || template.slot === 'offHand';
  return failItem(ctx, character, isWeaponSlot ? 'Weapon type not allowed for this class' : 'Armor type not allowed for this class');
}
const isWeaponSlot = template.slot === 'mainHand' || template.slot === 'offHand';
if (!isWeaponSlot && !isArmorAllowedForClass(character.className, template.armorType)) {
  return failItem(ctx, character, 'Armor type not allowed for this class');
}
```

The logic:
1. The `isClassAllowed` check already handles both weapon AND armor class restrictions via `template.allowedClasses`. If it fails, distinguish error message based on slot type.
2. The `isArmorAllowedForClass` check is an ADDITIONAL armor proficiency check (cloth/leather/chain/plate). It should ONLY run for armor slots (head, chest, wrists, hands, belt, legs, boots). Weapons use armorType='none' and are class-restricted via allowedClasses instead.
3. Accessory slots (earrings, neck, cloak) also have armorType='none', so they should also skip the armor proficiency check. Only armor body slots need it.

Simplified alternative — since weapon slots and accessory slots all have armorType='none', and 'none' is not in CLASS_ARMOR lists, we just need to skip the check when armorType is 'none':

```
if (!isClassAllowed(template.allowedClasses, character.className)) {
  const isWeaponSlot = template.slot === 'mainHand' || template.slot === 'offHand';
  return failItem(ctx, character, isWeaponSlot ? 'Weapon type not allowed for this class' : 'Class cannot use this item');
}
if (template.armorType !== 'none' && !isArmorAllowedForClass(character.className, template.armorType)) {
  return failItem(ctx, character, 'Armor type not allowed for this class');
}
```

Use the `template.armorType !== 'none'` approach since it is the most robust — it correctly skips the check for weapons (armorType='none'), accessories (armorType='none'), and cloaks (armorType='none') while still enforcing it for actual armor pieces (armorType='cloth'/'leather'/'chain'/'plate').

Note: normalizeArmorType is called on armorType at insertion time (see create_item_template reducer), so the stored value is already normalized lowercase. But to be safe, compare against the normalized form. Since the function normalizeArmorType returns 'cloth' for unknown values (not 'none'), check the raw stored value which is already normalized at insert time.
  </action>
  <verify>
1. `spacetime publish uwr --project-path spacetimedb` succeeds (module compiles)
2. In-game: create a druid character, attempt to equip Training Staff — should succeed
3. In-game: druid attempts to equip plate armor — should fail with "Armor type not allowed for this class"
4. In-game: warrior attempts to equip Training Staff — should fail with "Weapon type not allowed for this class"
  </verify>
  <done>
- Weapons (mainHand/offHand with armorType='none') can be equipped by classes listed in their allowedClasses field
- Armor proficiency check (cloth/leather/chain/plate) still enforced for actual armor slots
- Error message distinguishes "Weapon type not allowed" vs "Armor type not allowed" vs "Class cannot use this item"
  </done>
</task>

</tasks>

<verification>
- Training Staff equippable by druid (was previously blocked)
- Plate armor still blocked for cloth-only classes like druid
- Accessory items (earrings, neck, cloak with armorType='none') still equippable
- Weapon class restrictions still enforced (warrior can't use Training Staff)
- Module compiles and publishes without error
</verification>

<success_criteria>
- equip_item reducer skips isArmorAllowedForClass for items with armorType='none'
- Error messages correctly identify weapon vs armor type restriction failures
- No regression in armor proficiency enforcement for actual armor pieces
</success_criteria>

<output>
After completion, create `.planning/quick/9-fix-equipment-validation-allow-class-per/9-SUMMARY.md`
</output>
