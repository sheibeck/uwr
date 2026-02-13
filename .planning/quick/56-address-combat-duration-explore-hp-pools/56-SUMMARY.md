---
phase: quick-56
plan: 01
subsystem: combat-balance
tags: [balance, combat, hp-scaling, damage-reduction]
dependency_graph:
  requires: [combat-balance-enemies]
  provides: [balanced-combat-duration]
  affects: [character-survivability, enemy-survivability, combat-pacing]
tech_stack:
  added: [HP_STR_MULTIPLIER, GLOBAL_DAMAGE_MULTIPLIER]
  patterns: [centralized-tuning-constants, layered-damage-reduction]
key_files:
  created: []
  modified:
    - spacetimedb/src/data/class_stats.ts
    - spacetimedb/src/data/combat_scaling.ts
    - spacetimedb/src/index.ts
    - spacetimedb/src/reducers/characters.ts
decisions:
  - "HP scaling formula centralized with named constants (BASE_HP, HP_STR_MULTIPLIER) for easy tuning"
  - "Global damage multiplier (85n = 15% reduction) applied after armor/resist mitigation as final damage reduction layer"
  - "Enemy HP increased ~80% without touching damage values - enemies survive longer but don't hit harder"
  - "Player HP increased via higher BASE_HP (20n->50n) and HP_STR_MULTIPLIER (5n->8n) for ~1.8x effective HP"
metrics:
  duration: 8min
  completed: 2026-02-13
  tasks_completed: 2
  files_modified: 4
  verification: human-approved
---

# Quick Task 56: Address Combat Duration - Increase HP Pools and Add Global Damage Reduction

**One-liner:** Increased character and enemy HP pools by ~80-150% and added 15% global damage reduction to roughly double combat duration from 2-3 rounds to 4-6+ rounds.

## Objective

Address user feedback that combat encounters were too short (2-3 round burst fights) due to high damage relative to low HP pools. Make combat feel more strategic with longer engagements while maintaining clean, tunable balance constants.

## What Was Built

### HP Pool Increases

**Character HP scaling:**
- BASE_HP: 20n → 50n (+150%)
- HP_STR_MULTIPLIER: 5n (hardcoded) → 8n (new constant, +60%)
- Result: Level 1 Warrior HP: ~80 → ~146 HP (+82%)
- Result: Level 1 Wizard HP: ~60 → ~114 HP (+90%)

**Enemy HP scaling:**
- Tank: baseHp 20n → 40n, hpPerLevel 26n → 40n
- Healer: baseHp 16n → 30n, hpPerLevel 18n → 30n
- DPS: baseHp 14n → 28n, hpPerLevel 20n → 35n
- Support: baseHp 12n → 24n, hpPerLevel 16n → 25n
- Result: Level 1 DPS enemy HP: 34 → 63 HP (+85%)
- Result: Level 1 Tank enemy HP: 46 → 80 HP (+74%)

### Global Damage Reduction

**New constant:** `GLOBAL_DAMAGE_MULTIPLIER = 85n`
- Applied as final layer after armor/resist mitigation
- 85n = 85% of damage dealt (15% reduction)
- Works on both physical and magic damage paths
- Easy tuning lever: lower for longer fights (75n = 25% reduction), raise for shorter fights (95n = 5% reduction)

**Implementation:**
- `applyArmorMitigation`: armor reduction → global multiplier → return
- `applyMagicResistMitigation`: resist reduction → global multiplier → return

### Combined Effect

- Player effective HP: ~1.8-1.9x larger
- Enemy effective HP: ~1.7-1.8x larger
- All damage: 15% lower
- **Result:** Combat duration roughly 2-2.5x longer (4-6+ rounds instead of 2-3)

## Implementation Details

### File Changes

**spacetimedb/src/data/class_stats.ts**
- Added `HP_STR_MULTIPLIER = 8n` export
- Updated `BASE_HP` from 20n to 50n
- Centralized HP scaling constants for easy tuning

**spacetimedb/src/data/combat_scaling.ts**
- Added `GLOBAL_DAMAGE_MULTIPLIER = 85n` export with detailed JSDoc
- Updated `applyMagicResistMitigation` to apply global multiplier after resist reduction

**spacetimedb/src/index.ts**
- Imported `HP_STR_MULTIPLIER` and `GLOBAL_DAMAGE_MULTIPLIER`
- Updated `recomputeCharacterDerived` to use `HP_STR_MULTIPLIER` instead of hardcoded 5n
- Updated `applyArmorMitigation` to apply global multiplier after armor reduction
- Increased all enemy HP values in `ENEMY_ROLE_CONFIG`
- Added `HP_STR_MULTIPLIER` and `GLOBAL_DAMAGE_MULTIPLIER` to `reducerDeps` object

**spacetimedb/src/reducers/characters.ts**
- Added `HP_STR_MULTIPLIER` to deps destructuring
- Updated character creation HP formula to use `HP_STR_MULTIPLIER` instead of hardcoded 5n

## Verification

### Automated Verification
- Module compiled and published successfully: ✅
- Client bindings regenerated without errors: ✅
- No TypeScript compilation errors: ✅
- All imports resolve correctly: ✅

### Human Verification
**User tested combat encounters and confirmed:**
- Combat duration significantly improved ✅
- HP pools noticeably larger ✅
- Damage numbers reasonable ✅
- Combat feels more strategic with longer engagements ✅
- **Status:** APPROVED

## Deviations from Plan

None - plan executed exactly as written. All changes were anticipated and documented in the plan.

## Key Decisions

1. **Named constants over hardcoded values** - Replaced hardcoded `5n` with `HP_STR_MULTIPLIER` constant for maintainability
2. **Layered damage reduction** - Global multiplier applied AFTER armor/resist mitigation, not before. This preserves the relative value of defensive stats while reducing overall lethality
3. **Asymmetric HP increase** - Increased HP more aggressively than damage reduction (80-150% HP vs 15% damage reduction) to ensure noticeable improvement
4. **No enemy damage changes** - Only increased enemy HP, not damage output, to avoid making combat harder, just longer

## Tuning Guide

All balance constants are centralized for easy future adjustment:

**HP Tuning** (`spacetimedb/src/data/class_stats.ts`):
- `BASE_HP` - Base HP before STR scaling (currently 50n)
- `HP_STR_MULTIPLIER` - HP gained per STR point (currently 8n)

**Damage Tuning** (`spacetimedb/src/data/combat_scaling.ts`):
- `GLOBAL_DAMAGE_MULTIPLIER` - Percentage of damage dealt after mitigation (currently 85n)
  - Lower = longer combat (75n = 25% reduction)
  - Higher = shorter combat (95n = 5% reduction)
  - 100n = no global reduction (only armor/resist)

**Enemy HP Tuning** (`spacetimedb/src/index.ts`):
- `ENEMY_ROLE_CONFIG` - Per-role HP scaling (baseHp + hpPerLevel * level)

## Performance Impact

- No performance impact - simple arithmetic operations in existing damage calculation paths
- No new database queries or table scans
- Constants resolved at runtime with no additional overhead

## Testing Notes

Tested with:
- Fresh character creation (HP values displayed correctly)
- Multiple combat encounters (duration noticeably improved)
- Different character levels (HP scaling formula works correctly)
- Different enemy types (all roles use updated HP pools)

## Commits

| Commit | Message | Files |
|--------|---------|-------|
| 2df7a36 | feat(quick-56): increase HP pools and add global damage reduction | class_stats.ts, combat_scaling.ts, index.ts, characters.ts |

## Self-Check: PASSED

**Created files:** N/A (no new files, only modifications)

**Modified files verification:**
- spacetimedb/src/data/class_stats.ts: ✅ FOUND
- spacetimedb/src/data/combat_scaling.ts: ✅ FOUND
- spacetimedb/src/index.ts: ✅ FOUND
- spacetimedb/src/reducers/characters.ts: ✅ FOUND

**Commit verification:**
- 2df7a36: ✅ FOUND

**Constants verification:**
- BASE_HP = 50n: ✅ CONFIRMED
- HP_STR_MULTIPLIER = 8n: ✅ CONFIRMED
- GLOBAL_DAMAGE_MULTIPLIER = 85n: ✅ CONFIRMED

**Formula verification:**
- Character HP uses HP_STR_MULTIPLIER in index.ts: ✅ CONFIRMED
- Character HP uses HP_STR_MULTIPLIER in characters.ts: ✅ CONFIRMED
- Armor mitigation applies GLOBAL_DAMAGE_MULTIPLIER: ✅ CONFIRMED
- Magic resist mitigation applies GLOBAL_DAMAGE_MULTIPLIER: ✅ CONFIRMED

**Enemy HP verification:**
- Tank HP increased: ✅ CONFIRMED (20/26 → 40/40)
- Healer HP increased: ✅ CONFIRMED (16/18 → 30/30)
- DPS HP increased: ✅ CONFIRMED (14/20 → 28/35)
- Support HP increased: ✅ CONFIRMED (12/16 → 24/25)

All must-have criteria met. Plan execution complete.
