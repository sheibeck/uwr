---
phase: quick-68
plan: 01
subsystem: data-organization
tags: [refactoring, code-organization, maintainability]
dependency_graph:
  requires: []
  provides:
    - per-class-ability-files
    - ability-catalog-hub
  affects:
    - ability_catalog.ts
    - abilities/ directory
tech_stack:
  added: []
  patterns:
    - split-large-constants
    - import-re-export-hub
key_files:
  created:
    - spacetimedb/src/data/abilities/shaman_abilities.ts
    - spacetimedb/src/data/abilities/warrior_abilities.ts
    - spacetimedb/src/data/abilities/enchanter_abilities.ts
    - spacetimedb/src/data/abilities/cleric_abilities.ts
    - spacetimedb/src/data/abilities/wizard_abilities.ts
    - spacetimedb/src/data/abilities/rogue_abilities.ts
    - spacetimedb/src/data/abilities/paladin_abilities.ts
    - spacetimedb/src/data/abilities/ranger_abilities.ts
    - spacetimedb/src/data/abilities/necromancer_abilities.ts
    - spacetimedb/src/data/abilities/spellblade_abilities.ts
    - spacetimedb/src/data/abilities/bard_abilities.ts
    - spacetimedb/src/data/abilities/beastmaster_abilities.ts
    - spacetimedb/src/data/abilities/monk_abilities.ts
    - spacetimedb/src/data/abilities/druid_abilities.ts
    - spacetimedb/src/data/abilities/reaver_abilities.ts
    - spacetimedb/src/data/abilities/summoner_abilities.ts
    - spacetimedb/src/data/abilities/enemy_abilities.ts
  modified:
    - spacetimedb/src/data/ability_catalog.ts
decisions: []
metrics:
  duration_minutes: 6
  completed_date: "2026-02-13"
  tasks_completed: 2
  files_created: 17
  files_modified: 1
  lines_removed: 1412
  lines_added: 1514
---

# Quick 68: Split Ability Catalog by Class

**One-liner:** Refactored monolithic ability_catalog.ts (~1400 lines) into 17 per-class files with thin re-export hub for improved code organization and maintainability.

---

## Summary

Split the large ability_catalog.ts file into per-class ability files (16 player classes + 1 enemy file) to improve organization and make it easier to find, edit, and extend class-specific abilities. The refactored structure maintains 100% backward compatibility with all existing imports.

**Results:**
- ability_catalog.ts reduced from 1412 lines to 73 lines (95% reduction)
- 80 player abilities distributed across 16 class files
- 33 enemy abilities in dedicated enemy_abilities.ts
- All consumer imports unchanged (index.ts, combat_scaling.ts, combat.ts)
- Module builds and publishes successfully

---

## Tasks Completed

### Task 1: Create per-class ability files and enemy abilities file
**Duration:** ~3 minutes
**Commit:** db421e3

Created `spacetimedb/src/data/abilities/` directory with 17 TypeScript files:
- 16 class ability files (shaman through summoner)
- 1 enemy_abilities.ts file

Each file:
- Imports `AbilityMetadata` and `DamageType` from `../ability_catalog.js`
- Exports typed constant (`Record<string, AbilityMetadata>`)
- Contains exact byte-for-byte data from original ABILITIES/ENEMY_ABILITIES

**Verification:**
- All 17 files created successfully
- Each file exports its constant with proper typing
- Total: 80 player abilities + 33 enemy abilities

---

### Task 2: Refactor ability_catalog.ts to import and re-export
**Duration:** ~3 minutes
**Commit:** 810c155

Rewrote ability_catalog.ts as thin import/re-export hub:

**Structure:**
1. Types and constants at top:
   - `GLOBAL_COOLDOWN_MICROS`
   - `DamageType` type
   - `AbilityMetadata` interface (full definition)

2. Import all per-class constants:
   - 16 imports from `./abilities/{class}_abilities.js`

3. Merged ABILITIES export:
   - Spread all class abilities into single object
   - Type: `Record<string, AbilityMetadata>`

4. Re-export ENEMY_ABILITIES:
   - Direct re-export from `./abilities/enemy_abilities.js`

**Verification:**
- `npx tsc --noEmit` passes (no new errors introduced)
- `spacetime publish uwr` succeeds
- ability_catalog.ts reduced to 73 lines
- Consumer imports unchanged:
  - `spacetimedb/src/index.ts` imports `ABILITIES, ENEMY_ABILITIES, GLOBAL_COOLDOWN_MICROS`
  - `spacetimedb/src/data/combat_scaling.ts` imports `ABILITIES`
  - `spacetimedb/src/reducers/combat.ts` imports `ENEMY_ABILITIES`

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Technical Notes

### File Organization
```
spacetimedb/src/data/
├── ability_catalog.ts          (73 lines - hub)
└── abilities/
    ├── shaman_abilities.ts     (5 abilities)
    ├── warrior_abilities.ts    (5 abilities)
    ├── enchanter_abilities.ts  (5 abilities)
    ├── cleric_abilities.ts     (5 abilities)
    ├── wizard_abilities.ts     (5 abilities)
    ├── rogue_abilities.ts      (5 abilities)
    ├── paladin_abilities.ts    (5 abilities)
    ├── ranger_abilities.ts     (5 abilities)
    ├── necromancer_abilities.ts (5 abilities)
    ├── spellblade_abilities.ts (5 abilities)
    ├── bard_abilities.ts       (5 abilities)
    ├── beastmaster_abilities.ts (5 abilities)
    ├── monk_abilities.ts       (5 abilities)
    ├── druid_abilities.ts      (5 abilities)
    ├── reaver_abilities.ts     (5 abilities)
    ├── summoner_abilities.ts   (5 abilities)
    └── enemy_abilities.ts      (33 abilities)
```

### Import Pattern
All per-class files use relative imports from parent directory:
```typescript
import type { AbilityMetadata, DamageType } from '../ability_catalog.js';
```

This allows ability_catalog.ts to export types that the class files import, avoiding circular dependencies.

### Re-export Pattern
ability_catalog.ts uses spread operator to merge:
```typescript
export const ABILITIES: Record<string, AbilityMetadata> = {
  ...SHAMAN_ABILITIES,
  ...WARRIOR_ABILITIES,
  // ... all 16 classes
};
```

This maintains the same API surface for consumers while improving internal organization.

---

## Benefits

1. **Improved Discoverability:** Finding a class's abilities is now trivial - look in `{class}_abilities.ts`
2. **Reduced Merge Conflicts:** Changes to one class's abilities won't conflict with changes to another
3. **Easier Extension:** Adding new abilities per class is now isolated to single files
4. **Better IDE Performance:** Smaller files load and navigate faster
5. **Clearer Intent:** File names communicate content (vs. one giant file)
6. **Scalability:** Ready for expansion to 300-500+ abilities without monolithic file growth

---

## Self-Check: PASSED

**Created files verification:**
```bash
$ ls spacetimedb/src/data/abilities/
bard_abilities.ts           monk_abilities.ts
beastmaster_abilities.ts    necromancer_abilities.ts
cleric_abilities.ts         paladin_abilities.ts
druid_abilities.ts          ranger_abilities.ts
enchanter_abilities.ts      reaver_abilities.ts
enemy_abilities.ts          rogue_abilities.ts
shaman_abilities.ts         spellblade_abilities.ts
summoner_abilities.ts       warrior_abilities.ts
wizard_abilities.ts
```
FOUND: All 17 files

**Commits verification:**
```bash
$ git log --oneline -2
810c155 refactor(quick-68): reduce ability_catalog.ts to imports/re-exports
db421e3 feat(quick-68): create per-class ability files
```
FOUND: Both commits

**Module build verification:**
```bash
$ spacetime publish uwr --project-path spacetimedb
Build finished successfully.
Updated database with name: uwr
```
PASSED: Module publishes successfully

**Ability count verification:**
- Player abilities: 80 (16 classes × 5 abilities each)
- Enemy abilities: 33
- Total: 113 abilities preserved exactly

---

## Completion Status

- [x] Task 1: Create 17 per-class/enemy ability files
- [x] Task 2: Refactor ability_catalog.ts to hub pattern
- [x] All files exist and export properly
- [x] Module builds and publishes
- [x] Consumer imports unchanged
- [x] Ability counts verified (80 player + 33 enemy)
- [x] Self-check passed
- [x] SUMMARY.md created
