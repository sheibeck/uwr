---
phase: quick-67
plan: 01
subsystem: combat-system
tags: [abilities, tooltips, ui-polish, bug-fix]
dependency_graph:
  requires: [config-table-architecture]
  provides: [ability-descriptions-database]
  affects: [ability-tooltips, combat-ui]
tech_stack:
  added: []
  patterns: [data-seeding, tooltip-content]
key_files:
  created: []
  modified:
    - spacetimedb/src/data/ability_catalog.ts
    - spacetimedb/src/index.ts
decisions:
  - Escaped apostrophes in description strings instead of switching to double quotes for consistency
  - All 80 player abilities received unique, tooltip-style descriptions (1 sentence each)
  - Description format follows gameplay conventions: action + effect + damage type where applicable
metrics:
  duration_minutes: 7
  tasks_completed: 2
  files_modified: 2
  abilities_documented: 80
  completed: 2026-02-13
---

# Quick Task 67: Restore Ability Descriptions to AbilityTooltip

**One-liner:** Added meaningful descriptions to all 80 player abilities and fixed resolveDescription bug in seeding path

---

## Objective

Add description text to every player ability in the ABILITIES constant and fix the resolveDescription bug in ensureAbilityTemplates insert path. Previously, all ability tooltips showed only the ability name (the fallback) because ABILITIES entries had no description field, and the insert path passed wrong arguments to resolveDescription.

---

## Changes Made

### 1. AbilityMetadata Interface Extended

Added `description: string;` field to AbilityMetadata interface after the `name` field.

### 2. All Player Abilities Documented

Added descriptions to all 80 player abilities following these guidelines:

- **Damage abilities** (power > 0, no special fields): "Deals [physical/magic] damage to a single target."
- **DoT abilities** (dotPowerSplit/dotDuration): Mention damage-over-time aspect, e.g., "Inflicts poison damage over time."
- **HoT abilities** (hotPowerSplit/hotDuration): Mention healing over time, e.g., "Channels spirit energy to heal an ally over time."
- **Debuff abilities** (debuffType): Mention debuff effect, e.g., "Hexes the target, reducing their armor."
- **AoE abilities** (aoeTargets): Mention multiple targets, e.g., "Sweeps your weapon in a wide arc, striking all nearby enemies."
- **Utility/buff abilities**: Describe utility, e.g., "Summons a spirit wolf companion to fight alongside you."
- **Pet summon abilities**: "Summons a [creature] companion to fight alongside you."

Each description is concise (10-25 words), informative, and feels like tooltip text a player would read.

### 3. Fixed resolveDescription Bug

Changed line 4471 in ensureAbilityTemplates from:
```typescript
description: resolveDescription(key, entry),
```

To:
```typescript
description: resolveDescription(entry),
```

This matches the update path calls at lines 4421 and 4445, ensuring descriptions populate correctly from `ABILITIES.description`.

### 4. Database Re-seeded

Published module with `--clear-database` flag to re-seed all ability templates with new descriptions. Regenerated client bindings to ensure type safety.

---

## Commits

1. **8c166d7** - `feat(quick-67): add description field to AbilityMetadata and all player abilities`
2. **bd26e4e** - `fix(quick-67): correct resolveDescription call in insert path`

---

## Verification

- [x] TypeScript compiles without errors (ability_catalog.ts)
- [x] Module published successfully with `--clear-database`
- [x] `spacetime logs uwr` shows no errors during seeding
- [x] Client binding `src/module_bindings/ability_template_type.ts` has `description: __t.string()`
- [x] All 80 player abilities have description field (verified via grep count)
- [x] resolveDescription called consistently with `(entry)` in all paths

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Self-Check

Verifying all claims:

### Files Modified
- [x] `spacetimedb/src/data/ability_catalog.ts` - Added description field to interface and all 80 abilities
- [x] `spacetimedb/src/index.ts` - Fixed resolveDescription call at line 4471

### Commits Exist
- [x] `8c166d7` - feat commit for descriptions
- [x] `bd26e4e` - fix commit for resolveDescription

### Abilities Documented
- [x] 80 abilities in ABILITIES constant have description field (verified: 80 descriptions counted)

### Module Published
- [x] Database cleared and republished successfully
- [x] Logs show no errors during init reducer execution
- [x] Client bindings regenerated with description field

## Self-Check: PASSED

All files exist, commits are in git history, and functionality verified via logs.

---

## Impact

**Users:** Ability tooltips now show meaningful descriptions instead of just ability names, improving gameplay clarity.

**Developers:** Descriptions stored in database via AbilityTemplate table, accessible to clients via subscriptions. All ability metadata consolidated in one location.

**Technical Debt:** Fixed seeding bug that would have caused description field to receive wrong data on new ability inserts.
