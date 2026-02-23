---
phase: quick-294
plan: 01
subsystem: combat
tags: [combat, variance, rng, damage, healing]
dependency_graph:
  requires: []
  provides: [applyVariance utility]
  affects: [auto-attacks, ability damage, healing, enemy abilities, pet damage]
tech_stack:
  added: []
  patterns: [deterministic seed-based PRNG variance]
key_files:
  created: []
  modified:
    - spacetimedb/src/helpers/combat_enemies.ts
    - spacetimedb/src/helpers/combat.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/index.ts
decisions:
  - Used prime-number seed offsets (7919, 997, 4231, 1009, 6173) at each call site to decorrelate variance rolls
  - Applied variance AFTER armor/magic mitigation but BEFORE outcome multipliers (for auto-attacks)
  - Threat tracks actual varied damage dealt, not pre-variance values
  - DoT/HoT per-tick values remain unvaried to avoid confusing fluctuations
metrics:
  duration: 258s
  completed: 2026-02-23T21:08:05Z
---

# Quick Task 294: Add +-15% Damage/Healing Variance Summary

Deterministic seed-based +-15% variance on all combat damage and healing using `applyVariance(value, seed)` with prime-offset decorrelated rolls across 6 call sites.

## What Changed

### New Utility: `applyVariance`
Added to `combat_enemies.ts` alongside existing `applyArmorMitigation` and `scaleByPercent`:
- Formula: `value * (85 + abs(seed) % 31) / 100` producing range [85%, 115%] of base
- Minimum return of 1n to prevent zero-damage hits
- Fully deterministic using bigint seed arithmetic (no Math.random)

### Integration Points (6 call sites)

| Path | File | Seed | What Varies |
|------|------|------|-------------|
| Auto-attacks (player/enemy/pet) | reducers/combat.ts `resolveAttack` | `seed + 7919n` | Post-armor damage before crit/block multiplier |
| Player ability damage (single-target) | helpers/combat.ts `applyDamage` | `nowMicros + character.id + i * 997n` | Per-hit mitigated damage |
| Player ability damage (AoE) | helpers/combat.ts `applyDamage` | `nowMicros + character.id + targetEnemy.id` | Per-target mitigated damage |
| Player healing | helpers/combat.ts `applyHeal` | `nowMicros + character.id + target.id + 4231n` | Scaled heal amount |
| Enemy ability damage | helpers/combat.ts `applyEnemyAbilityDamage` | `target.id + BigInt(abilityName.length) * 1009n` | Post-mitigation damage |
| Enemy ability vs pet | helpers/combat.ts `executeEnemyAbility` | `enemyId + pet.id + 6173n` | Raw pet damage |

### What Does NOT Vary
- DoT per-tick damage (already subdivided from total budget)
- HoT per-tick healing (same reasoning)
- Resource costs (mana, stamina)
- Threat multipliers (threat tracks actual damage dealt)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | ca72840 | feat(quick-294): add +-15% damage/healing variance to all combat paths |

## Deviations from Plan

### Additional File Modified
**[Rule 3 - Blocking] Added applyVariance to index.ts reducerDeps**
- **Found during:** Task 1
- **Issue:** `reducers/combat.ts` receives `applyVariance` through a `deps` object constructed in `index.ts`, not via direct import
- **Fix:** Added `applyVariance` to the import from `combat_enemies` and to the `reducerDeps` object in `index.ts`
- **Files modified:** spacetimedb/src/index.ts
- **Commit:** ca72840

## Verification

- TypeScript compilation: No new errors (all errors pre-existing in unrelated files)
- Module publish: Successful to local SpacetimeDB
- `applyVariance` present in all 3 target files plus `index.ts` dependency wiring
- No `Math.random()` calls in any modified file
- All values guaranteed >= 1n

## Self-Check: PASSED
