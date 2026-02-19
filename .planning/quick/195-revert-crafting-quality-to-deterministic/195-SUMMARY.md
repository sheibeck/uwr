---
phase: quick-195
plan: 01
subsystem: crafting
tags: [crafting, materials, gather, deterministic, tier-gating]
dependency_graph:
  requires: []
  provides: [deterministic-craft-quality, zone-tier-gated-gather-pool]
  affects: [craft_recipe reducer, getGatherableResourceTemplates, spawnResourceNode, passive gather ability]
tech_stack:
  added: []
  patterns: [deterministic-mapping, zone-tier-derivation-from-danger-multiplier]
key_files:
  modified:
    - spacetimedb/src/data/crafting_materials.ts
    - spacetimedb/src/reducers/items.ts
    - spacetimedb/src/helpers/location.ts
    - spacetimedb/src/helpers/combat.ts
decisions:
  - Crafting quality is fully deterministic: T1 mat → standard, T2 mat → reinforced, T3 mat → exquisite (no CRAFT_QUALITY_PROBS)
  - Zone tier derived from dangerMultiplier: dm<130n=T1, dm<190n=T2, dm>=190n=T3 (covers 100/160/200 thresholds)
  - Gather pool default zoneTier=3 in getGatherableResourceTemplates for backward compat with ensure_enemies.ts seeding
metrics:
  duration: ~10min
  completed: 2026-02-18
  tasks_completed: 2
  files_modified: 4
---

# Phase quick-195 Plan 01: Revert Crafting Quality to Deterministic and Tier-Gate Gather Pool Summary

Deterministic craft quality (T1→standard, T2→reinforced, T3→exquisite) with zone-tier-gated material gather pool so T1 zones cannot yield T2/T3 crafting materials.

## What Was Built

### Task 1: Deterministic materialTierToCraftQuality

Removed the `CRAFT_QUALITY_PROBS` probabilistic constant and rewrote `materialTierToCraftQuality` to be a pure 3-way deterministic mapping with no `seed` parameter. Updated `craft_recipe` in `items.ts` to call `materialTierToCraftQuality(materialTier)` with one argument (removed `craftSeed` computation).

**Before:**
- `CRAFT_QUALITY_PROBS` defined probabilistic weights: T1=[85,15,0], T2=[20,65,15], T3=[5,35,60]
- `materialTierToCraftQuality(tier, seed?)` used seed to roll against weights
- `craft_recipe` computed `craftSeed = ctx.timestamp.microsSinceUnixEpoch + character.id` and passed it

**After:**
- No `CRAFT_QUALITY_PROBS` constant
- `materialTierToCraftQuality(tier: bigint): string` — returns `'standard'`/`'reinforced'`/`'exquisite'` deterministically
- `craft_recipe` calls `materialTierToCraftQuality(materialTier)` with one argument

### Task 2: Zone-Tier-Gated Gather Pool

Updated `getGatherableResourceTemplates` to accept an optional `zoneTier: number = 3` parameter. The material injection loop now skips materials where `Number(mat.tier) > zoneTier`. Updated `spawnResourceNode` and the combat passive gather ability to derive `zoneTier` from `region.dangerMultiplier` using thresholds `dm < 130n → 1`, `dm < 190n → 2`, `dm >= 190n → 3`.

- `ensure_enemies.ts` seeding call (`getGatherableResourceTemplates(ctx, terrainType)`) unchanged — defaults to `zoneTier=3`, all materials eligible in loot tables
- T1 zones (dangerMultiplier=100): only Copper Ore gatherable from mountains/plains
- T2 zones (dangerMultiplier=160): Copper Ore + Iron Ore gatherable
- T3 zones (dangerMultiplier=200): all tiers (Copper, Iron, Darksteel) gatherable

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | `60dea26` | feat(quick-195): revert materialTierToCraftQuality to deterministic, remove craftSeed |
| Task 2 | `df5a5a3` | feat(quick-195): tier-gate gather pool by zone dangerMultiplier |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `materialTierToCraftQuality` has no `seed` parameter — confirmed
- `CRAFT_QUALITY_PROBS` does not exist in crafting_materials.ts — confirmed
- `craft_recipe` calls `materialTierToCraftQuality(materialTier)` with one argument — confirmed
- `getGatherableResourceTemplates` signature includes `zoneTier: number = 3` — confirmed
- `spawnResourceNode` derives `zoneTier` from `region.dangerMultiplier` — confirmed
- Combat passive gather ability derives `gatherZoneTier` from `region.dangerMultiplier` — confirmed
- Module published successfully — confirmed
