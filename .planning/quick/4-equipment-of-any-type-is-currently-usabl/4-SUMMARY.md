---
phase: quick-4
plan: 01
type: execute
subsystem: equipment-restrictions
tags: [client, ui, inventory, armor-proficiency, tooltips]
dependencies:
  requires: []
  provides: [armor-proficiency-client-check, item-tooltip-restrictions]
  affects: [useInventory, App.vue]
tech-stack:
  added: [CLASS_ARMOR-client-map]
  patterns: [armor-type-proficiency, tooltip-enhancement]
key-files:
  created: []
  modified:
    - src/composables/useInventory.ts
    - src/App.vue
decisions:
  - Duplicated CLASS_ARMOR map client-side rather than importing from backend (client cannot import server files)
  - Added allowedClasses field to EquippedSlot type for tooltip consistency
  - Show armor type for all armor items (users infer class restrictions from armor type knowledge)
metrics:
  duration_seconds: 148
  tasks_completed: 2
  files_modified: 2
  commits: 2
completed: 2026-02-12T14:25:58Z
---

# Quick Task 4: Equipment Type Restrictions Summary

**One-liner:** Client-side armor proficiency check prevents equipping incompatible armor types and tooltips now show class/armor restrictions

---

## Overview

Fixed equipment class restrictions by adding client-side armor type proficiency validation to the equipable flag and enhancing item tooltips to display class restriction information. Previously, the backend enforced armor type restrictions but the client showed "Equip" buttons for all armor regardless of class proficiency, leading to silent failures when players clicked them.

---

## Tasks Completed

### Task 1: Add armor type proficiency check to client-side equipable flag
**Status:** Complete | **Commit:** 07ba15a

Added CLASS_ARMOR map (client-side copy from backend) defining which armor types each class can wear. Updated the `inventoryItems` computed in useInventory.ts to include `armorAllowed` check that validates if the character's class can wear the item's armor type. Modified equipable flag calculation to include both `classAllowed` AND `armorAllowed`.

Also added `allowedClasses` field to EquippedSlot type and populated it in the equippedSlots computed so equipped items can show class restriction info in tooltips.

**Files modified:**
- src/composables/useInventory.ts

**Key changes:**
- Added CLASS_ARMOR constant with 16 class definitions
- Added armorAllowed logic: checks if armor type is in class's allowed armor list
- Updated equipable to include armorAllowed
- Added allowedClasses to EquippedSlot type

### Task 2: Add class restriction info to item hover tooltips
**Status:** Complete | **Commit:** aa50ee2

Enhanced item tooltips in App.vue to display class restrictions and armor type information. Tooltips now show:
- "Classes: warrior" (or comma-separated list) when allowedClasses is not 'any'
- "Armor: Plate" (capitalized) when armorType is not 'none'
- No extra lines for unrestricted items (accessories, consumables)

**Files modified:**
- src/App.vue

**Key changes:**
- Added conditional allowedClasses line to tooltip
- Added conditional armorType line to tooltip
- Reused existing tooltipLine style
- Capitalized armor type for display

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Verification Results

### TypeScript Compilation
Ran `npx vue-tsc --noEmit` - no new errors introduced by changes. Pre-existing TypeScript errors in codebase are unrelated to this quick task.

### Expected Behavior
- Wizard characters should NOT see Equip button on plate/chain/leather armor items
- Rogues should NOT see Equip button on plate/chain armor (can wear leather)
- Warriors/Paladins should see Equip button on all armor types (can wear all)
- Hovering over class-restricted weapons shows "Classes: ..." in tooltip
- Hovering over armor shows "Armor: Plate/Chain/Leather/Cloth" in tooltip
- Hovering over consumables/accessories shows no class/armor restriction lines

---

## Technical Details

### CLASS_ARMOR Map Structure
```typescript
const CLASS_ARMOR: Record<string, string[]> = {
  // Cloth-only classes (7)
  bard: ['cloth'],
  enchanter: ['cloth'],
  cleric: ['cloth'],
  wizard: ['cloth'],
  druid: ['cloth'],
  necromancer: ['cloth'],
  summoner: ['cloth'],

  // Leather classes (5)
  rogue: ['leather', 'cloth'],
  monk: ['leather', 'cloth'],
  spellblade: ['leather', 'cloth'],
  reaver: ['leather', 'cloth'],
  beastmaster: ['leather', 'cloth'],

  // Chain classes (2)
  ranger: ['chain', 'leather', 'cloth'],
  shaman: ['chain', 'leather', 'cloth'],

  // Plate classes (2)
  warrior: ['plate', 'chain', 'leather', 'cloth'],
  paladin: ['plate', 'chain', 'leather', 'cloth'],
};
```

### Armor Proficiency Check Logic
```typescript
const armorAllowed =
  !template?.armorType ||
  template.armorType === 'none' ||
  (CLASS_ARMOR[normalizedClass] ?? ['cloth']).includes(template.armorType.toLowerCase());
```

This check:
1. Passes if item has no armor type (weapons, accessories)
2. Passes if armor type is 'none' (non-armor equipment)
3. Falls back to cloth-only if class not in map
4. Compares lowercase armor type with class's allowed list

---

## Impact

### User Experience
- **Clear visual feedback:** Equip button now hidden for items that cannot be equipped due to armor type restrictions
- **Better information:** Tooltips provide upfront class/armor restriction info
- **Reduced confusion:** No more silent failures when clicking Equip on incompatible items

### Code Quality
- Consistent with backend enforcement (backend already had CLASS_ARMOR and isArmorAllowedForClass check)
- Client-side validation prevents unnecessary reducer calls
- Tooltip enhancement improves discoverability of item restrictions

---

## Self-Check

### Files Created
None - only modifications.

### Files Modified
- [x] src/composables/useInventory.ts - VERIFIED
- [x] src/App.vue - VERIFIED

### Commits Created
- [x] 07ba15a: feat(quick-4): add armor type proficiency check to equipable flag - VERIFIED
- [x] aa50ee2: feat(quick-4): add class/armor type info to item tooltips - VERIFIED

### Self-Check: PASSED

All files modified as expected. All commits exist in git history. Changes align with plan objectives.

---

## Next Steps

None - quick task complete. No follow-up work required.

---

## Notes

- CLASS_ARMOR map is duplicated client-side because client cannot import from backend SpacetimeDB module
- Future enhancement: Could fetch armor proficiency from a public view or table if backend exposes it
- Tooltip enhancement is purely additive - no existing tooltip behavior changed
- Backend equip_item reducer behavior unchanged (already enforced restrictions)
