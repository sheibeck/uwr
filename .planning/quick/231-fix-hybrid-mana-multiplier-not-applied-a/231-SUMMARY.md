---
phase: quick-231
plan: "01"
subsystem: character-creation
tags: [bug-fix, mana, hybrid-classes, characters]
dependency_graph:
  requires: [quick-229]
  provides: [correct-hybrid-mana-at-creation]
  affects: [character-creation, paladin, ranger, reaver, spellblade]
tech_stack:
  added: []
  patterns: [conditional-multiplier-lookup]
key_files:
  created: []
  modified:
    - spacetimedb/src/index.ts
    - spacetimedb/src/reducers/characters.ts
decisions:
  - "normalizeClassName was already imported in index.ts; added to reducerDeps without duplicating import"
metrics:
  duration: "~5 minutes"
  completed: "2026-02-21T16:28:40Z"
  tasks_completed: 2
  files_modified: 2
---

# Phase quick-231 Plan 01: Fix Hybrid Mana Multiplier Not Applied Summary

**One-liner:** Fixed `create_character` using hardcoded `* 6n` instead of HYBRID_MANA_MULTIPLIER (4n) for paladin/ranger/reaver/spellblade, so hybrid classes now get the correct reduced mana pool at character creation.

## What Was Done

The `create_character` reducer in `spacetimedb/src/reducers/characters.ts` was computing `maxMana` with a hardcoded multiplier of `6n` for all mana-using classes. This was introduced in quick-229 which added `HYBRID_MANA_MULTIPLIER = 4n` and `HYBRID_MANA_CLASSES` for the four hybrid classes (paladin, ranger, reaver, spellblade), but forgot to wire them into `create_character`.

### Changes Made

**Task 1 — index.ts:**
- Added `MANA_MULTIPLIER`, `HYBRID_MANA_MULTIPLIER`, `HYBRID_MANA_CLASSES` to import from `./data/class_stats`
- Added all four constants (`MANA_MULTIPLIER`, `HYBRID_MANA_MULTIPLIER`, `HYBRID_MANA_CLASSES`, `normalizeClassName`) to the `reducerDeps` object

**Task 2 — characters.ts:**
- Destructured `MANA_MULTIPLIER`, `HYBRID_MANA_MULTIPLIER`, `HYBRID_MANA_CLASSES`, `normalizeClassName` from `deps`
- Replaced `manaStat * 6n` with `manaStat * manaMultiplier` where `manaMultiplier` is determined by checking `HYBRID_MANA_CLASSES.has(normalizeClassName(className))`

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 4ce69f9 | feat(quick-231-01): add MANA_MULTIPLIER, HYBRID_MANA_MULTIPLIER, HYBRID_MANA_CLASSES, normalizeClassName to reducerDeps |
| 2 | 128e8bf | fix(quick-231-01): use conditional mana multiplier in create_character |

## Verification

- Module published to local SpacetimeDB successfully (no build errors)
- No raw `* 6n` in the maxMana formula
- `HYBRID_MANA_CLASSES.has(normalizeClassName(className))` used in conditional
- New paladin/ranger/reaver/spellblade characters will receive 4/6 the mana of equivalent full casters

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- `spacetimedb/src/index.ts` modified with correct imports and reducerDeps entries
- `spacetimedb/src/reducers/characters.ts` modified with correct destructuring and conditional multiplier
- Commits 4ce69f9 and 128e8bf exist and verified
- Module published without errors
