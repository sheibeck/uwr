---
phase: quick-111
plan: "01"
subsystem: combat
tags: [enemy-ai, combat, dot, debuff, bug-fix]
dependency_graph:
  requires: []
  provides: [enemy-dot-debuff-effects]
  affects: [spacetimedb/src/helpers/combat.ts]
tech_stack:
  added: []
  patterns: [named-import-from-catalog]
key_files:
  created: []
  modified:
    - spacetimedb/src/helpers/combat.ts
decisions:
  - "Import ENEMY_ABILITIES from ability_catalog rather than maintaining a parallel stub"
metrics:
  duration: "3min"
  completed: "2026-02-17"
---

# Quick Task 111: Fix Enemy DoT/Debuff Effects Not Applying — Summary

## One-liner

Replaced empty `ENEMY_ABILITIES` stub with real named import from `ability_catalog`, enabling enemy poison/venom/hex/curse abilities to resolve and insert CharacterEffect rows during combat.

## What Was Done

### Task 1: Verify fix and commit

The fix had already been applied to `spacetimedb/src/helpers/combat.ts`. Verification confirmed:

- Line 36: `import { ENEMY_ABILITIES } from '../data/ability_catalog';` is present
- The old stub `const ENEMY_ABILITIES: any = {};` is removed
- Three call sites (`enemyAbilityCastMicros`, `enemyAbilityCooldownMicros`, `executeEnemyAbility`) all correctly reference the imported catalog

The diff was clean — a single-line swap (stub const replaced by import).

## Root Cause

`helpers/combat.ts` had a placeholder stub that was never wired to the real data:

```typescript
// Before (broken)
const ENEMY_ABILITIES: any = {}; // Will be populated from data
```

This meant every `ENEMY_ABILITIES[abilityKey]` lookup returned `undefined`, causing `executeEnemyAbility` to return early without inserting any `CharacterEffect` rows. Enemies with DoT/debuff abilities (spider venom, shaman hex, bog witch curse, etc.) appeared to execute but applied no effects.

## Fix

```typescript
// After (correct)
import { ENEMY_ABILITIES } from '../data/ability_catalog';
```

The `ENEMY_ABILITIES` export already existed in `ability_catalog.ts` with all enemy ability definitions — it simply wasn't being imported in the combat helper.

## Deviations from Plan

None — plan executed exactly as written. Fix was pre-applied; verification confirmed correctness; commit created.

## Republish Note

The user must republish the backend for the fix to be live:

```bash
spacetime publish uwr --project-path spacetimedb
```

No bindings regeneration needed — no schema changes were made.

## Self-Check: PASSED

- `spacetimedb/src/helpers/combat.ts` — verified FOUND with correct import
- Commit `6e800fa` — verified EXISTS
