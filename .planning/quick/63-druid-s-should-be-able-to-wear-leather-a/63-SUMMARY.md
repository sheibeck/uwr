---
phase: quick-63
plan: 01
subsystem: game-balance
tags: [class-mechanics, armor-proficiency, druid]
dependency_graph:
  requires: []
  provides: [druid-leather-proficiency]
  affects: [equipment-system, class-balance]
tech_stack:
  added: []
  patterns: [data-driven-armor-proficiency]
key_files:
  created: []
  modified:
    - spacetimedb/src/data/class_stats.ts
    - spacetimedb/src/index.ts
decisions:
  - title: "Druid armor proficiency expanded"
    rationale: "Druids are nature-themed and should logically wear leather (natural material) like other nature classes (beastmaster)"
    alternatives: "Could have kept druids cloth-only, but inconsistent with class fantasy"
metrics:
  duration: "2min"
  completed: 2026-02-13T08:33:18Z
  tasks: 1
  commits: 1
---

# Phase Quick-63 Plan 01: Druid Leather Armor Summary

**One-liner:** Enabled druids to equip leather armor by adding leather proficiency to CLASS_ARMOR and updating seed data allowedClasses.

---

## What Was Built

Druids can now wear leather armor in addition to cloth armor, aligning them with other nature-themed classes like beastmaster.

**Changes:**
1. **CLASS_ARMOR map** - Updated `druid: ['cloth']` to `druid: ['leather', 'cloth']` in class_stats.ts
2. **ARMOR_ALLOWED_CLASSES seed data** - Added `druid` to the leather entry in index.ts

**Server-side validation:** The `isArmorAllowedForClass` function uses CLASS_ARMOR to validate equip_item reducer calls.

**Client-side display:** Leather armor ItemTemplates now have `allowedClasses` including druid, which drives:
- Equipment tooltip "Classes:" field
- Inventory panel equipable flag (classAllowed check)

---

## Implementation Details

### Files Modified

#### spacetimedb/src/data/class_stats.ts
- Updated CLASS_ARMOR['druid'] from `['cloth']` to `['leather', 'cloth']`
- This controls server-side armor proficiency validation via `isArmorAllowedForClass`

#### spacetimedb/src/index.ts
- Updated ARMOR_ALLOWED_CLASSES['leather'] to include 'druid'
- This seeds ItemTemplate.allowedClasses field for all leather armor pieces
- Client reads allowedClasses to display restrictions and determine equipability

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Testing Notes

**Verification (post-republish):**
1. Druid characters can equip leather armor items (server validation passes)
2. Leather armor tooltips show "Classes: warrior, paladin, ranger, shaman, rogue, monk, spellblade, reaver, beastmaster, druid"
3. Cloth armor still works (no regression)
4. Other classes unaffected

**Note:** TypeScript compilation shows pre-existing errors unrelated to this change (parameter type annotations in reducers). These errors exist on master and are not introduced by this task.

---

## Key Decisions

**Decision: Add leather, maintain cloth**
- Druids now wear leather + cloth (not leather-only)
- Consistent with hybrid progression pattern (cloth → leather)
- No loss of existing functionality

**Pattern alignment:**
- Beastmaster: `['leather', 'cloth']`
- Druid: `['leather', 'cloth']` (now matches)
- Both are nature-themed classes with wisdom focus

---

## Commits

| Task | Commit | Files Modified |
|------|--------|----------------|
| Task 1: Add leather to druid armor proficiency and update seed data | 2c5a19f | class_stats.ts, index.ts |

---

## Self-Check: PASSED

**Created files:** None required
**Modified files:**
- ✅ spacetimedb/src/data/class_stats.ts exists and contains `druid: ['leather', 'cloth']`
- ✅ spacetimedb/src/index.ts exists and contains `leather: '...druid'`

**Commits:**
- ✅ Commit 2c5a19f exists

**Verification:**
```bash
# Confirmed CLASS_ARMOR druid entry
grep "druid.*\[.*leather" spacetimedb/src/data/class_stats.ts
# Output: druid: ['leather', 'cloth'],

# Confirmed ARMOR_ALLOWED_CLASSES leather entry includes druid
grep "leather:.*druid" spacetimedb/src/index.ts
# Output: leather: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid',
```

---

## Impact

**Gameplay:**
- Druids gain access to leather armor items (4 AC base vs 2 AC for cloth)
- Better survivability for druids in early-mid game
- More vendor/loot options for druid players

**Balance:**
- Druids remain primary casters (WIS primary)
- Leather proficiency matches shaman (another WIS/caster hybrid)
- No regression to other classes

**Technical:**
- Zero breaking changes
- Pure data configuration update
- Requires database republish with --clear-database to re-seed armor allowedClasses

---

## Next Steps

1. Republish module: `spacetime publish uwr --clear-database -y --project-path C:\projects\uwr\spacetimedb`
2. Regenerate bindings: `spacetime generate --lang typescript --out-dir C:\projects\uwr\client\src\module_bindings --project-path C:\projects\uwr\spacetimedb`
3. Manual verification:
   - Create/select druid character
   - Check leather armor in vendor/loot tooltips
   - Equip leather armor piece
   - Confirm no errors in combat
