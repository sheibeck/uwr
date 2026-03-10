---
phase: 36-ability-expansion
plan: 01
subsystem: ability-system
tags: [mechanical-vocabulary, schema, skill-budget, tdd]
dependency_graph:
  requires: []
  provides: [ABILITY_KINDS-27, BASE_BUDGET-27, AbilityTemplate-source-abilityKey]
  affects: [skill_budget, ability generation, combat dispatch]
tech_stack:
  added: []
  patterns: [TDD-red-green, export-const for testability]
key_files:
  created:
    - spacetimedb/src/data/mechanical_vocabulary.test.ts
  modified:
    - spacetimedb/src/data/mechanical_vocabulary.ts
    - spacetimedb/src/helpers/skill_budget.ts
    - spacetimedb/src/schema/tables.ts
decisions:
  - "Exported BASE_BUDGET from skill_budget.ts to enable cross-module test coverage"
  - "resurrect kind uses minMult === maxMult (flat budget) -- test uses toBeGreaterThanOrEqual"
  - "Pre-existing TS errors (corpse.ts, location.ts, reducers) are out of scope, logged to deferred-items.md"
  - "AbilityTemplate schema change requires --clear-database on next local publish"
metrics:
  duration: ~10 minutes
  completed_date: 2026-03-10
  tasks_completed: 2
  files_changed: 4
---

# Phase 36 Plan 01: Ability Vocabulary Expansion Summary

**One-liner:** Expanded ABILITY_KINDS from 15 to 27 entries, exported BASE_BUDGET with full coverage, added source/abilityKey columns to AbilityTemplate schema.

## What Was Built

### Task 1: Expand ABILITY_KINDS and add BASE_BUDGET entries (TDD)

Added 12 new ability kinds to `mechanical_vocabulary.ts`:
- `song` — toggle party-wide persistent effect
- `aura` — passive area radiating from caster
- `travel` — movement speed / location reveal
- `fear` — CC preventing enemy actions (flee)
- `bandage` — consumable-like heal, long cooldown
- `potion` — consumable-like buff/heal, long cooldown
- `food_summon` — create consumable food items
- `resurrect` — revive dead party member (flat budget: base=1, minMult=maxMult=1.0)
- `group_heal` — heal all party members
- `craft_boost` — boost next crafting action quality
- `gather_boost` — boost next gathering action yield
- `pet_command` — command active summoned pet

Exported `BASE_BUDGET` from `skill_budget.ts` and added entries for all 12 new kinds with appropriate power scaling values.

Created `mechanical_vocabulary.test.ts` (5 tests) validating:
1. All 15 original kinds present
2. All 12 new kinds present
3. Exactly 27 total entries
4. Every ABILITY_KINDS entry has a BASE_BUDGET entry
5. Budget entries have valid numeric fields

### Task 2: Add source and abilityKey columns to AbilityTemplate

Added two optional columns to the `ability_template` table in `tables.ts`:
- `source: t.string().optional()` — tracks ability origin: `'Class' | 'Renown' | 'Race'` (null defaults to `'Class'` at read time)
- `abilityKey: t.string().optional()` — stable identifier for race/renown abilities (e.g. `'race_troll_regen'`, `'renown_rank2_haggle'`)

Both columns are optional, so all existing LLM-generated class ability rows work without migration.

## Deviations from Plan

### Out-of-scope issues logged to deferred-items.md

Pre-existing TypeScript errors in `combat.ts`, `corpse.ts`, `location.ts`, and reducer files were found during `npx tsc --noEmit` verification. Confirmed pre-existing via git stash test — not caused by Plan 01 changes. Logged to `.planning/phases/36-ability-expansion/deferred-items.md`.

### Test fix: resurrect budget assertion

Test assertion `expect(maxMult).toBeGreaterThan(minMult)` failed for `resurrect` which intentionally has `minMult === maxMult === 1.0` (flat, no variance). Changed to `toBeGreaterThanOrEqual` — this is a valid design decision for the resurrect kind.

## Commits

- `3cdc7f3` — feat(36-01): expand ABILITY_KINDS with 12 new kinds and add BASE_BUDGET entries
- `5105bea` — feat(36-01): add source and abilityKey optional columns to AbilityTemplate

## Self-Check: PASSED
