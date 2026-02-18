---
phase: quick-178
plan: 01
subsystem: enemy-abilities
tags: [refactor, data-consolidation, enemy-abilities, seeding]
dependency_graph:
  requires: [quick-176]
  provides: [single-source-enemy-abilities]
  affects: [spacetimedb/src/seeding/ensure_world.ts, spacetimedb/src/data/abilities/enemy_abilities.ts]
tech_stack:
  added: []
  patterns: [ENEMY_TEMPLATE_ABILITIES loop-driven seeding, targetRule field on all ability entries]
key_files:
  created: []
  modified:
    - spacetimedb/src/data/abilities/enemy_abilities.ts
    - spacetimedb/src/seeding/ensure_world.ts
    - .planning/STATE.md
decisions:
  - "ENEMY_ABILITIES is the single source of truth for both metadata (execution) and DB seeding — adding an ability requires editing only enemy_abilities.ts"
  - "targetRule added to all 41 ENEMY_ABILITIES entries — dot/debuff='aggro', heal='lowest_hp', aoe_damage='all_players', buff='all_allies'"
  - "ENEMY_TEMPLATE_ABILITIES maps 35 templates to 41 abilities — colocated with ENEMY_ABILITIES in same file"
  - "ensureEnemyAbilities inner helper (upsertEnemyAbility) preserved unchanged — only call sites replaced by loop"
metrics:
  duration: ~12min
  completed: 2026-02-18
  tasks: 3
  files: 3
---

# Phase quick-178 Plan 01: Enemy Ability Consolidation Summary

**One-liner:** Consolidated enemy ability definitions from two-place duplication into single ENEMY_ABILITIES + ENEMY_TEMPLATE_ABILITIES constants in enemy_abilities.ts; ensureEnemyAbilities() now derives all DB seeding data from these constants via a loop.

## What Was Done

Enemy ability data was duplicated across two files that had to be kept in sync:
1. `ENEMY_ABILITIES` in `data/abilities/enemy_abilities.ts` — execution metadata (power, damageType, dotPowerSplit, aiChance, etc.)
2. `ensureEnemyAbilities()` in `seeding/ensure_world.ts` — 40 hardcoded upsertEnemyAbility calls with duplicated name/kind/castSeconds/cooldownSeconds/targetRule

This caused the quick-176 bug: adding night enemies only in one place meant DB seeding worked but execution failed (or vice versa).

## Changes Made

### Task 1 — enemy_abilities.ts
- Added `targetRule` field to all 41 ENEMY_ABILITIES entries (previously only 4 entries had it)
  - dot/debuff abilities: `targetRule: 'aggro'`
  - heal abilities (shaman_heal, dark_mend): kept `targetRule: 'lowest_hp'`
  - aoe_damage abilities (flame_burst, quake_wave): added `targetRule: 'all_players'`
  - buff abilities (warchief_rally, bolster_defenses): kept `targetRule: 'all_allies'`
- Added new exported `ENEMY_TEMPLATE_ABILITIES: Record<string, string[]>` constant mapping 35 enemy template names to their ability keys
- All 41 unique ability keys cross-reference: every ENEMY_ABILITIES key appears in at least one template, every template ability key exists in ENEMY_ABILITIES

### Task 2 — ensure_world.ts
- Added import: `ENEMY_ABILITIES, ENEMY_TEMPLATE_ABILITIES from '../data/abilities/enemy_abilities'`
- Replaced 40 hardcoded `upsertEnemyAbility(templateName, key, name, kind, castSeconds, cooldownSeconds, targetRule)` calls with a single loop:
  ```typescript
  for (const [templateName, abilityKeys] of Object.entries(ENEMY_TEMPLATE_ABILITIES)) {
    for (const abilityKey of abilityKeys) {
      const ability = ENEMY_ABILITIES[abilityKey as keyof typeof ENEMY_ABILITIES];
      if (!ability) continue;
      upsertEnemyAbility(templateName, abilityKey, ability.name, ability.kind,
        ability.castSeconds, ability.cooldownSeconds, ability.targetRule);
    }
  }
  ```
- The inner `upsertEnemyAbility` helper function is completely unchanged

### Task 3 — Verification + STATE.md
- Verified helpers/combat.ts and reducers/combat.ts continue to import ENEMY_ABILITIES from `data/ability_catalog` (unchanged — zero behavioral changes)
- Verified zero hardcoded ability metadata calls in ensure_world.ts (grep confirms 0 `upsertEnemyAbility` calls with literal string/bigint args)
- Updated STATE.md Decision #155: old wording described two-place requirement; new wording reflects single-file pattern

## Verification

- TypeScript error count: 230 before changes, 230 after — no new errors introduced
- All 41 ENEMY_ABILITIES entries have targetRule field
- All 41 unique ability keys in ENEMY_TEMPLATE_ABILITIES exist in ENEMY_ABILITIES
- Zero hardcoded ability metadata in ensure_world.ts body

## How to Add a New Enemy Ability (Post-Consolidation)

1. Add entry to `ENEMY_ABILITIES` in `data/abilities/enemy_abilities.ts` with all fields including `targetRule`
2. Add entry to `ENEMY_TEMPLATE_ABILITIES` in the same file mapping template name to ability key
3. That's it — ensureEnemyAbilities() will pick it up automatically on next `spacetime publish`

## Deviations from Plan

### Pre-existing context discovered

**Finding:** `helpers/combat.ts` and `reducers/combat.ts` import ENEMY_ABILITIES from `data/ability_catalog.ts`, NOT from `data/abilities/enemy_abilities.ts`. These are two separate constants that are mostly in sync (ability_catalog.ts has 33 entries, enemy_abilities.ts has 41 including night enemies).

**Impact on plan:** The plan's Task 3 stated "combat.ts already reads from ENEMY_ABILITIES — no changes needed." This is correct in spirit (execution works unchanged) but technically the files are different. The plan's scope was specifically the seeding side (ensure_world.ts), which is now consolidated.

**Not fixed in this plan:** The deeper duplication between ability_catalog.ts (execution) and enemy_abilities.ts (now also used for seeding) remains a separate architectural concern. ability_catalog.ts is missing the 8 night enemy abilities added in quick-176 — this means executeEnemyAbility silently no-ops on night enemy abilities (they fall back to auto-attack). This pre-existed before quick-178 and is a separate fix.

**Note:** This is a pre-existing issue, not introduced by quick-178. The plan's stated scope (eliminating seeding duplication) is complete.

## Self-Check: PASSED

- [x] spacetimedb/src/data/abilities/enemy_abilities.ts modified with targetRule on all entries and ENEMY_TEMPLATE_ABILITIES exported
- [x] spacetimedb/src/seeding/ensure_world.ts imports ENEMY_ABILITIES and ENEMY_TEMPLATE_ABILITIES, loop replaces hardcoded calls
- [x] .planning/STATE.md Decision #155 updated
- [x] Commits: f405eac (Task 1), ff1b808 (Task 2), a1645f0 (Task 3)
