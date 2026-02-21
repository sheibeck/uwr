---
phase: quick-232
plan: "01"
subsystem: backend/characters
tags: [refactor, derived-stats, character-creation, mana, spacetimedb]
dependency_graph:
  requires: []
  provides: [create_character uses recomputeCharacterDerived as single source of truth]
  affects: [spacetimedb/src/reducers/characters.ts]
tech_stack:
  added: []
  patterns: [single-source-of-truth derived stat computation]
key_files:
  created: []
  modified:
    - spacetimedb/src/reducers/characters.ts
decisions:
  - Remove inline derived stat formulas from create_character; delegate entirely to recomputeCharacterDerived
metrics:
  duration: "~5 minutes"
  tasks_completed: 1
  tasks_total: 1
  completed_date: "2026-02-21"
---

# Phase quick-232 Plan 01: Consolidate Derived Stat Computation Summary

**One-liner:** Eliminated duplicate derived-stat formulas from create_character by delegating to recomputeCharacterDerived, ensuring any formula changes (like HYBRID_MANA_MULTIPLIER) apply automatically at character creation.

## What Was Done

Removed the inline derived stat computation block from `create_character` in `spacetimedb/src/reducers/characters.ts`. Previously, `create_character` duplicated formulas for maxHp, maxMana, maxStamina, armorClass, hitChance, dodgeChance, parryChance, critMelee/Ranged/Divine/Arcane, perception, search, ccPower, vendorBuyMod, and vendorSellMod. These were silently out of sync with `recomputeCharacterDerived` — the root cause of the mana pool bug fixed in quick-231.

The fix inserts the character with 0n placeholder derived fields, calls `recomputeCharacterDerived(ctx, character)` to fill them in, then reads the updated row back and sets hp/mana/stamina to their respective maxima so new characters start at full resources.

## Commits

| Commit | Description | Files |
|--------|-------------|-------|
| b76329e | refactor(quick-232): consolidate derived stat computation into recomputeCharacterDerived | spacetimedb/src/reducers/characters.ts |

## Verification

1. `recomputeCharacterDerived` appears in deps destructuring (line 92) and as a call after insert (line 323) - PASS
2. Removed constants (`manaMultiplier`, `HYBRID_MANA_CLASSES`, `manaStat = manaStatForClass`, etc.) - no matches in file - PASS
3. `spacetime publish uwr` - clean build, no errors - PASS

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- File modified: `spacetimedb/src/reducers/characters.ts` - EXISTS
- Commit b76329e - EXISTS (confirmed via git log)
