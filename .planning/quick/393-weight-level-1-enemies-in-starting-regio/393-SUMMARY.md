---
phase: quick-393
plan: 01
subsystem: world-generation
tags: [starter-region, enemy-scaling, race-sharing, world-gen]
dependency_graph:
  requires: []
  provides: [starter-region-danger-pinned, race-based-starter-sharing]
  affects: [world_gen.ts, tables.ts, index.ts]
tech_stack:
  added: []
  patterns: [isStarter-flag, starterForRace-column, region-scan-for-race]
key_files:
  created: []
  modified:
    - spacetimedb/src/helpers/world_gen.ts
    - spacetimedb/src/helpers/world_gen.test.ts
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/index.ts
decisions:
  - computeRegionDanger uses isStarter boolean (default false) rather than checking sourceRegionId directly, keeping the helper pure and testable
  - Region scan for starterForRace uses iter() (no index) since very few regions exist and multi-column indexes are broken in SpacetimeDB TS
  - Enemy level clamping: baseLevel<=1n forces minLevel=maxLevel=1n (no L2 enemies in starter zones)
metrics:
  duration: ~15min
  completed: "2026-03-10"
  tasks_completed: 2
  files_modified: 4
---

# Quick Task 393: Weight Level-1 Enemies in Starting Region Summary

**One-liner:** Starter regions pinned at dangerMultiplier=100n (baseLevel=1, all enemies L1); same-race players share starter regions via new starterForRace column.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Pin starter region danger to 100n and clamp enemies to L1 | f7df43e | world_gen.ts, world_gen.test.ts |
| 2 | Share starter regions by race via starterForRace column | b8ee016 | tables.ts, world_gen.ts, index.ts |

## What Was Built

### Task 1: Starter Region Danger Pinning

`computeRegionDanger` now accepts an `isStarter` boolean parameter (default `false`). When `true`, returns exactly `100n` regardless of source danger or timestamp.

`writeGeneratedRegion` detects starter regions by checking `genState.sourceRegionId === 0n` and passes `isStarter=true` to `computeRegionDanger`.

Enemy level clamping was fixed: when `baseLevel <= 1n`, both `minLevel` and `maxLevel` are set to `1n`. Previously, `maxLevel = baseLevel + 1n = 2n` allowed level-2 enemies in starter regions.

### Task 2: Race-Based Starter Region Sharing

Added `starterForRace: t.string().optional()` column to the `Region` table schema. Requires `--clear-database` on next publish.

`writeGeneratedRegion` accepts an optional `starterRace` parameter; when provided, sets `starterForRace` on the inserted region.

In `prepare_world_gen_llm`, when `sourceRegionId === 0n`, the reducer now scans all regions for one with a matching `starterForRace`. If found, the character is placed in the existing starter region and the reducer returns early (no LLM call, no budget consumed).

In `submit_llm_result` for domain `world_gen`, the character's race is read and passed to `writeGeneratedRegion` when `sourceRegionId === 0n` so the new region gets tagged.

## Tests Added

New test suites in `world_gen.test.ts`:

- `computeRegionDanger` suite: tests non-starter increase (50-100), starter pinning to 100n, and danger cap at 800n
- `writeGeneratedRegion - starter region behavior` suite: tests dangerMultiplier=100n for sourceRegionId=0n, enemy level clamping to L1, and normal danger increase for non-starter regions

All 12 world_gen tests pass. Pre-existing 4 failures in `combat.test.ts` are unrelated to this task.

## Deviations from Plan

None - plan executed exactly as written.

## Verification Steps (Manual)

1. Publish with schema change: `spacetime publish uwr -p spacetimedb --clear-database -y`
2. Create a Halfling character -- starter region should have dangerMultiplier=100n
3. All enemies in starter region should be level 1
4. Create another Halfling character -- should be placed in same starter region (no LLM generation)
5. Create an Elf character -- should generate a new starter region

## Self-Check

**Files exist:**
- spacetimedb/src/helpers/world_gen.ts -- FOUND
- spacetimedb/src/helpers/world_gen.test.ts -- FOUND
- spacetimedb/src/schema/tables.ts -- FOUND
- spacetimedb/src/index.ts -- FOUND

**Commits exist:**
- f7df43e -- Task 1 commit
- b8ee016 -- Task 2 commit

## Self-Check: PASSED
