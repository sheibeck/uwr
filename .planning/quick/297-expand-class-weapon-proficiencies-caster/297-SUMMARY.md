---
phase: 297-expand-class-weapon-proficiencies-caster
plan: 01
subsystem: item-system
tags: [weapons, class-proficiency, build-diversity]
dependency-graph:
  requires: []
  provides: [expanded-weapon-proficiencies]
  affects: [character-equipment, item-seeding]
tech-stack:
  added: []
  patterns: [data-only-change]
key-files:
  modified:
    - spacetimedb/src/data/item_defs.ts
decisions:
  - Ranger gets ALL weapon types for maximum versatility
  - Casters share dagger proficiency as secondary weapon option
  - Monk gets dagger in addition to staff
  - Druid gets mace in addition to staff and dagger
metrics:
  duration: 114s
  completed: 2026-02-23T22:22:00Z
  tasks: 1/1
---

# Quick Task 297: Expand Class Weapon Proficiencies Summary

Broadened weapon proficiencies across all 9 weapon types (starter, T1, T2) so casters get dagger access, ranger gets all weapons, and several melee classes gain additional weapon options.

## Task Results

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update allowedClasses on all weapon items | 67b8b77 | spacetimedb/src/data/item_defs.ts |

## Changes Made

### Proficiency Mapping Applied

| Weapon Type | New allowedClasses |
|-------------|-------------------|
| sword | warrior, paladin, bard, spellblade, reaver, **ranger** |
| mace | paladin, cleric, **druid**, **ranger** |
| staff | enchanter, necromancer, summoner, druid, shaman, monk, wizard, **ranger** |
| bow | ranger (unchanged) |
| dagger | rogue, **enchanter**, **necromancer**, **summoner**, **wizard**, **shaman**, **druid**, **monk**, **ranger** |
| axe | beastmaster, **warrior**, **reaver**, **ranger** |
| blade | spellblade, reaver, **ranger** |
| rapier | bard, **ranger** |
| greatsword | warrior, paladin, reaver, **spellblade**, **ranger** |

Bold indicates newly added classes.

### Scope

- 24 weapon item lines updated across 3 sections (STARTER_WEAPON_DEFS, WORLD_DROP_GEAR_DEFS T1, WORLD_DROP_GEAR_DEFS T2)
- No armor, jewelry, crafting, or non-weapon items modified
- ARMOR_ALLOWED_CLASSES record untouched

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- All 9 weapon types grep-verified with correct allowedClasses across all 3 sections
- Git diff confirms only weapon lines changed (24 insertions, 24 deletions, 1 file)
- Module published successfully to local SpacetimeDB

## Self-Check: PASSED
