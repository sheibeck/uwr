---
phase: quick-353
plan: 01
subsystem: combat-engine
tags: [v2.0, class-system, mana, combat, refactor]
dependency_graph:
  requires: []
  provides: [dynamic-class-support, ability-based-mana-detection]
  affects: [character-creation, combat, level-up, equipment]
tech_stack:
  added: []
  patterns: [ability-based-resource-detection, stat-based-primary-secondary-detection]
key_files:
  created: []
  modified:
    - spacetimedb/src/data/class_stats.ts
    - spacetimedb/src/helpers/character.ts
    - spacetimedb/src/helpers/combat.ts
    - spacetimedb/src/helpers/combat_rewards.ts
    - spacetimedb/src/helpers/items.ts
    - spacetimedb/src/data/combat_scaling.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/reducers/characters.ts
    - spacetimedb/src/reducers/commands.ts
    - spacetimedb/src/reducers/items.ts
    - spacetimedb/src/index.ts
decisions:
  - "All player characters can parry (universal combat mechanic, no class restriction)"
  - "Threat multiplier derives from shield-equipped (tank) and heal-abilities (healer) instead of class name"
  - "Base armor defaults to 2n (cloth equivalent) for all characters; actual armor from equipment"
  - "Starter items: cloth armor for all; no starter shields (shields found/bought in-game)"
  - "detectPrimarySecondary infers primary/secondary stats from highest stat values"
  - "isArmorAllowedForClass check removed entirely (v2.0 armor no longer class-gated)"
  - "Single MANA_MULTIPLIER for all mana users (no hybrid distinction)"
metrics:
  duration: 7min
  completed: "2026-03-08"
---

# Quick Task 353: Remove Hardcoded Class Data, Derive Mana from Abilities

Removed all hardcoded class lists (CLASS_CONFIG, MANA_CLASSES, PARRY_CLASSES, TANK_CLASSES, HEALER_CLASSES, CLASS_ARMOR, SHIELD_CLASSES) from class_stats.ts and updated every consumer to derive behavior from character data instead of class name lookups. Mana is now derived from whether a character has abilities with resourceType === 'mana'.

## Task Results

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Gut class_stats.ts | d6cecc3 | Done |
| 2 | Update all consumers | 54d329f | Done |

## Changes Made

### class_stats.ts (gutted)
- Removed 15 class-specific exports (CLASS_CONFIG, MANA_CLASSES, HYBRID_MANA_CLASSES, PARRY_CLASSES, TANK_CLASSES, HEALER_CLASSES, CLASS_ARMOR, SHIELD_CLASSES, BASE_ARMOR_CLASS, and 6 functions)
- Removed HYBRID_MANA_MULTIPLIER (single MANA_MULTIPLIER for all)
- Added `characterUsesResource(ctx, characterId, resourceType)` — queries ability_template table
- Added `bestCasterStat(stats)` — returns max(int, wis, cha) for mana computation
- Added `detectPrimarySecondary(character)` — infers primary/secondary from stat values
- Kept: StatKey, base constants, normalizeClassName, normalizeArmorType, computeBaseStatsForGenerated

### recomputeCharacterDerived (character.ts)
- Mana: `characterUsesResource(ctx, character.id, 'mana')` replaces `usesMana(className)`
- Mana stat: `bestCasterStat(totalStats)` replaces `manaStatForClass(className, stats)`
- Single `MANA_MULTIPLIER` for all (no hybrid distinction)
- Armor: default `2n` base replaces `baseArmorForClass(className)`

### Combat (combat.ts, combat.ts reducer)
- Threat: shield-equipped = tank threat, heal-abilities = healer threat (replaces TANK_CLASSES/HEALER_CLASSES sets)
- Parry: all player characters can parry (replaces PARRY_CLASSES check)

### Level-up (combat_rewards.ts, commands.ts)
- `detectPrimarySecondary(character)` + `computeBaseStatsForGenerated(primary, secondary, level)` replaces `computeBaseStats(className, level)`

### Equipment (items.ts, items.ts reducer)
- Starter items: cloth armor for all, Training Sword default weapon for generated classes
- `isArmorAllowedForClass` check removed entirely (v2.0 armor not class-gated)

### Ability scaling (combat_scaling.ts)
- Hybrid stat scaling: `detectPrimarySecondary(characterStats)` replaces `getClassConfig(className)`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed isArmorAllowedForClass in items.ts reducer**
- **Found during:** Task 2
- **Issue:** reducers/items.ts also imported and used isArmorAllowedForClass, not listed in plan
- **Fix:** Removed the import and the armor class check (v2.0 armor is not class-gated)
- **Files modified:** spacetimedb/src/reducers/items.ts

**2. [Rule 1 - Bug] Fixed duplicate computeBaseStatsForGenerated in reducerDeps**
- **Found during:** Task 2
- **Issue:** After replacing computeBaseStats with computeBaseStatsForGenerated in deps, there were two entries
- **Fix:** Removed the duplicate entry
- **Files modified:** spacetimedb/src/index.ts

## Verification

- TypeScript compiles clean (no new errors, only pre-existing implicit-any and bigint warnings)
- Local SpacetimeDB publish succeeds
- Zero references to removed class-specific exports outside class_stats.ts
