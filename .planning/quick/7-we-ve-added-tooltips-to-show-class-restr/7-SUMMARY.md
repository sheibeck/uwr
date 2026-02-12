---
phase: quick-7
plan: 01
subsystem: items-tooltips-armor-restrictions
tags:
  - bugfix
  - item-system
  - tooltips
  - armor-proficiency
dependency_graph:
  requires:
    - item-template-system
    - class-armor-proficiency
  provides:
    - visible-armor-class-restrictions
    - correct-armor-enforcement
  affects:
    - tooltip-display
    - equip-validation
tech_stack:
  added: []
  patterns:
    - armor-proficiency-validation
    - tooltip-data-mapping
key_files:
  created: []
  modified:
    - spacetimedb/src/reducers/items.ts
    - spacetimedb/src/index.ts
    - src/App.vue
    - src/components/VendorPanel.vue
    - src/composables/useCombat.ts
decisions:
  - decision: "Fixed swapped isArmorAllowedForClass arguments in equip_item reducer"
    context: "Function signature is (className, armorType) but call was (armorType, className)"
    rationale: "Swapped arguments made armor check silently pass for all combinations"
  - decision: "Created ARMOR_ALLOWED_CLASSES map in seed data instead of duplicating class lists"
    context: "Three armor pieces per armor type needed class restrictions"
    rationale: "DRY principle - single source of truth for armor type to class mapping"
  - decision: "Cloth armor remains 'any' instead of listing all 16 classes"
    context: "All classes can wear cloth armor"
    rationale: "'any' is clearer than comma-separated list of 16 class names"
metrics:
  duration_minutes: 3
  tasks_completed: 2
  files_modified: 5
  commits: 2
  completed_date: 2026-02-12
---

# Quick Task 7: Fix Armor Class Restrictions and Tooltips

**One-liner:** Fixed swapped armor proficiency check arguments and updated armor seed data to show proper class restrictions (plate=warrior,paladin; chain=4 classes; leather=9 classes) in all tooltip contexts.

---

## Objective

Fix two related issues: (1) server-side armor proficiency check had swapped arguments making it silently pass all equip attempts, and (2) armor seed data used 'any' for all armor types, preventing tooltips from showing which classes can wear each armor type.

---

## Tasks Completed

### Task 1: Fix server-side armor enforcement and update armor seed data with proper class restrictions

**Files modified:**
- `spacetimedb/src/reducers/items.ts`
- `spacetimedb/src/index.ts`

**Changes:**
1. Fixed swapped arguments in `equip_item` reducer line 272:
   - Was: `isArmorAllowedForClass(template.armorType, character.className)`
   - Now: `isArmorAllowedForClass(character.className, template.armorType)`
   - Bug impact: With swapped args, check always passed because `CLASS_ARMOR["plate"]` is undefined (defaults to `['cloth']`) and `normalizeArmorType("wizard")` returns `'cloth'`, so every check resolved to true

2. Added `ARMOR_ALLOWED_CLASSES` helper map before armor seed loop (line 3228):
   ```typescript
   const ARMOR_ALLOWED_CLASSES: Record<string, string> = {
     plate: 'warrior,paladin',
     chain: 'warrior,paladin,ranger,shaman',
     leather: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster',
     cloth: 'any',
   };
   ```

3. Updated armor seed data for all three armor pieces (chest, legs, boots):
   - Changed: `allowedClasses: 'any'`
   - To: `allowedClasses: ARMOR_ALLOWED_CLASSES[armorType] ?? 'any'`

**Verification:**
- ✅ `npx vue-tsc --noEmit --project spacetimedb/tsconfig.json` passes (only pre-existing errors)
- ✅ Grep confirmed correct argument order: `isArmorAllowedForClass(character.className`
- ✅ Grep confirmed ARMOR_ALLOWED_CLASSES map exists and is used in 3 places

**Commit:** `292835a`

---

### Task 2: Add allowedClasses and armorType to vendor and loot tooltip data

**Files modified:**
- `src/App.vue`
- `src/components/VendorPanel.vue`
- `src/composables/useCombat.ts`

**Changes:**
1. Added `allowedClasses` field to `vendorItems` computed in `App.vue` (line 746)
2. Added `allowedClasses: string;` to VendorPanel vendorItems prop type (line 103)
3. Added both `allowedClasses` and `armorType` fields to `activeLoot` computed in `useCombat.ts` (lines 208-209)

**Rationale:** Inventory items already include `allowedClasses` and `armorType` from `useInventory.ts`. Vendor and loot items needed the same fields for consistent tooltip display across all item contexts.

**Verification:**
- ✅ `npx vue-tsc --noEmit` passes (only pre-existing errors)
- ✅ Grep confirmed `allowedClasses` field added to vendorItems computed
- ✅ Grep confirmed VendorPanel type definition updated
- ✅ Grep confirmed activeLoot includes both fields

**Commit:** `f5d9476`

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Overall Verification

All success criteria met:
1. ✅ `isArmorAllowedForClass(character.className` confirmed in items.ts (correct argument order)
2. ✅ ARMOR_ALLOWED_CLASSES map confirmed in index.ts with proper class restrictions
3. ✅ allowedClasses field confirmed in App.vue vendorItems computed
4. ✅ allowedClasses field confirmed in VendorPanel.vue type definition
5. ✅ allowedClasses and armorType fields confirmed in useCombat.ts activeLoot
6. ✅ TypeScript compilation passes without new errors

---

## Impact

**Backend:**
- Armor proficiency enforcement now works correctly - rejects invalid equip attempts
- Armor items seeded with proper class restrictions instead of 'any'

**Frontend:**
- Vendor item tooltips now show "Classes: warrior, paladin" for plate armor
- Loot item tooltips now show "Classes:" and "Armor:" lines
- Consistent tooltip behavior across inventory, vendor, and loot contexts

**User Experience:**
- Players can now see which classes can equip armor items before purchasing or looting
- Server correctly prevents equipping armor that class cannot wear

---

## Technical Details

**Why the armor check was broken:**

The `isArmorAllowedForClass` function signature is:
```typescript
function isArmorAllowedForClass(className: string, armorType: string)
```

The equip_item reducer was calling it with swapped arguments:
```typescript
isArmorAllowedForClass(template.armorType, character.className)
// e.g., isArmorAllowedForClass("plate", "wizard")
```

This caused:
1. `normalizeClassName("plate")` → `"plate"`
2. `CLASS_ARMOR["plate"]` → `undefined` (defaults to `['cloth']`)
3. `normalizeArmorType("wizard")` → `"cloth"` (invalid armor type defaults to cloth)
4. Check becomes: `['cloth'].includes('cloth')` → `true` (WRONG!)

With correct arguments:
```typescript
isArmorAllowedForClass(character.className, template.armorType)
// e.g., isArmorAllowedForClass("wizard", "plate")
```

This correctly:
1. `normalizeClassName("wizard")` → `"wizard"`
2. `CLASS_ARMOR["wizard"]` → `['cloth']`
3. `normalizeArmorType("plate")` → `"plate"`
4. Check becomes: `['cloth'].includes('plate')` → `false` (CORRECT!)

---

## Self-Check: PASSED

**Created files:** None (as expected)

**Modified files:**
- ✅ FOUND: spacetimedb/src/reducers/items.ts
- ✅ FOUND: spacetimedb/src/index.ts
- ✅ FOUND: src/App.vue
- ✅ FOUND: src/components/VendorPanel.vue
- ✅ FOUND: src/composables/useCombat.ts

**Commits:**
- ✅ FOUND: 292835a (Task 1)
- ✅ FOUND: f5d9476 (Task 2)

All files and commits verified successfully.
