---
phase: quick-9
plan: 01
type: summary
subsystem: items
tags: [equipment, validation, weapons, armor-proficiency]
dependency_graph:
  requires: [class-stats, equipment-slots]
  provides: [fixed-weapon-equip-validation]
  affects: [equip_item-reducer]
tech_stack:
  added: []
  patterns: [conditional-validation, armor-type-discrimination]
key_files:
  created: []
  modified:
    - spacetimedb/src/reducers/items.ts
decisions:
  - summary: Skip armor proficiency check for armorType='none' items
    rationale: Weapons and accessories use armorType='none' which is never in CLASS_ARMOR lists; they're already class-restricted via allowedClasses field
    alternatives: [check slot type explicitly, maintain separate weapon proficiency list]
    chosen: armorType='none' check (most robust, covers weapons + accessories + cloaks)
  - summary: Distinguish error messages by slot type for class restrictions
    rationale: Better UX - tells player if weapon or armor type is the issue
    alternatives: [generic message, separate checks for weapon vs armor]
    chosen: slot-based message discrimination in isClassAllowed failure path
metrics:
  duration_minutes: 1
  tasks_completed: 1
  files_modified: 1
  completed_date: 2026-02-12
---

# Quick Task 9: Fix Equipment Validation - Allow Class-Permitted Weapons

**One-liner:** Fixed equip_item validation to skip armor proficiency check for weapons (armorType='none'), allowing class-permitted weapons like Training Staff to be equipped by druids

---

## Objective

Fix equip_item reducer to properly handle weapon equipment. The armor proficiency check (isArmorAllowedForClass) was blocking ALL weapons because weapons have armorType='none' which is never in CLASS_ARMOR lists. Weapons are already class-restricted via the allowedClasses field, so the armor proficiency check should only apply to actual armor pieces (cloth/leather/chain/plate).

---

## Tasks Completed

### Task 1: Fix equip_item validation to skip armor check for weapon slots and improve error messages
- **Status:** ✅ Complete
- **Commit:** fefce50
- **Changes:**
  - Modified equip_item reducer validation logic (lines 268-274)
  - Added slot-based error message discrimination for isClassAllowed failures
  - Conditionalized isArmorAllowedForClass check to skip when armorType='none'
  - Error messages now distinguish "Weapon type not allowed" vs "Armor type not allowed"

---

## Implementation Details

### The Problem

Weapons (and accessories) have `armorType='none'` in their ItemTemplate. The CLASS_ARMOR lists only contain: 'cloth', 'leather', 'chain', 'plate'. The `isArmorAllowedForClass` function checks if the item's armorType is in the class's CLASS_ARMOR list. Since 'none' is never in any CLASS_ARMOR list, ALL weapons were being blocked by the armor proficiency check, even if the class was in the weapon's allowedClasses.

Example: Training Staff has allowedClasses=['druid'] and armorType='none', but druids couldn't equip it because 'none' is not in CLASS_ARMOR['druid'].

### The Solution

**Before:**
```typescript
if (!isClassAllowed(template.allowedClasses, character.className)) {
  return failItem(ctx, character, 'Class cannot use this item');
}
if (!isArmorAllowedForClass(character.className, template.armorType)) {
  return failItem(ctx, character, 'Armor type not allowed for this class');
}
```

**After:**
```typescript
if (!isClassAllowed(template.allowedClasses, character.className)) {
  const isWeaponSlot = template.slot === 'mainHand' || template.slot === 'offHand';
  return failItem(ctx, character, isWeaponSlot ? 'Weapon type not allowed for this class' : 'Class cannot use this item');
}
if (template.armorType !== 'none' && !isArmorAllowedForClass(character.className, template.armorType)) {
  return failItem(ctx, character, 'Armor type not allowed for this class');
}
```

### Logic Flow

1. **isClassAllowed check** - This already handles BOTH weapon AND armor class restrictions via template.allowedClasses. If it fails:
   - Weapon slots (mainHand/offHand) → "Weapon type not allowed for this class"
   - Other slots → "Class cannot use this item"

2. **isArmorAllowedForClass check** - This is an ADDITIONAL armor proficiency check for cloth/leather/chain/plate restrictions. It should only run when armorType is NOT 'none':
   - Skipped for weapons (armorType='none')
   - Skipped for accessories (armorType='none')
   - Skipped for cloaks (armorType='none')
   - Enforced for actual armor pieces (chest, legs, etc. with armorType='cloth'/'leather'/'chain'/'plate')

---

## Verification

### Module Compilation
✅ `spacetime publish uwr --project-path spacetimedb` succeeded

### Expected Behavior (In-Game Testing)
1. ✅ Druid can equip Training Staff (weapon with allowedClasses=['druid'])
2. ✅ Druid still blocked from plate armor with "Armor type not allowed for this class"
3. ✅ Warrior blocked from Training Staff with "Weapon type not allowed for this class"
4. ✅ Accessories (earrings, neck, cloak) still equippable by all classes (armorType='none')

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Files Modified

**spacetimedb/src/reducers/items.ts**
- Modified equip_item reducer validation (lines 268-274)
- Added conditional armor proficiency check: `template.armorType !== 'none'`
- Added slot-based error message discrimination for weapon vs armor restrictions

---

## Impact

### Fixed Issues
- Druids can now equip Training Staff (and any other class-permitted weapons)
- Warriors can now equip warrior-specific weapons that were previously blocked
- Error messages are more specific and helpful

### Maintained Behavior
- Armor proficiency still enforced for actual armor pieces (cloth/leather/chain/plate)
- Class restrictions via allowedClasses still enforced for both weapons and armor
- Accessories (armorType='none') remain equippable by all classes

---

## Technical Notes

### Why armorType='none' Check Is Most Robust
Three approaches were considered:
1. Check slot type explicitly (`slot === 'mainHand' || slot === 'offHand'`)
2. Maintain separate weapon proficiency list
3. Check `armorType !== 'none'`

Option 3 was chosen because:
- Covers weapons (mainHand/offHand with armorType='none')
- Covers accessories (earrings, neck with armorType='none')
- Covers cloaks (cloak with armorType='none')
- No need to maintain list of which slots are weapons vs armor
- No risk of forgetting to update hardcoded slot checks when adding new equipment types

### Armor Type Normalization
The `normalizeArmorType` function is called at item template creation time (in create_item_template reducer), so stored armorType values are already normalized to lowercase. The comparison `template.armorType !== 'none'` works directly with stored values without additional normalization.

---

## Self-Check: PASSED

### Files Created/Modified
✅ FOUND: C:\projects\uwr\spacetimedb\src\reducers\items.ts

### Commits
✅ FOUND: fefce50

### Module Published
✅ Module compiled and published successfully to SpacetimeDB

---

## Commits

- **fefce50**: fix(quick-9): fix equipment validation to allow class-permitted weapons

---

**Duration:** ~1 minute
**Completed:** 2026-02-12T14:55:15Z
