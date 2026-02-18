---
phase: quick
plan: 163
subsystem: crafting-materials, combat
tags: [essence, loot, combat, crafting-materials, seeding]
dependency_graph:
  requires: [quick-161]
  provides: [essence-iv-drop, correct-essence-tier-thresholds]
  affects: [combat-loot, crafting-reagents]
tech_stack:
  added: []
  patterns: [essence-drop-tier-scaling]
key_files:
  created: []
  modified:
    - spacetimedb/src/data/crafting_materials.ts
    - spacetimedb/src/seeding/ensure_items.ts
    - spacetimedb/src/reducers/combat.ts
decisions:
  - Essence IV vendorValue set to 24n (double Essence III's 12n), consistent with Tier N doubling pattern
  - No MATERIAL_AFFIX_MAP entry for Essence IV — Essences have no affixes (consistent with I/II/III)
metrics:
  duration: ~1min
  completed: 2026-02-18
  tasks_completed: 2
  files_modified: 3
---

# Quick Task 163: Fix Essence Tiers (1-10=I, 11-20=II, 21-30=III, 31+=IV) Summary

**One-liner:** Fixed 5-level-wide essence drop bands to correct 10-level-wide bands and added Essence IV material for level 31+ enemies.

## What Was Done

The essence drop system introduced in quick-161 used incorrect 5-level bands (1-5=I, 6-10=II, 11+=III) instead of the intended 10-level bands aligned with enemy tier structure. Additionally, Essence IV did not exist, leaving level 31+ enemies without a valid essence to drop.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add Essence IV to material data and seed | db5994e | crafting_materials.ts, ensure_items.ts |
| 2 | Fix essence drop thresholds in combat reducer | 4df1c5c | combat.ts |

## Changes Made

### Task 1 — Essence IV Material Data and Seed

**`spacetimedb/src/data/crafting_materials.ts`**
- Updated comment from "13 materials" to "14 materials"
- Added `essence_iv` entry to `MATERIAL_DEFS` array with `tier: 4n`, drop sources from beast/construct/spirit/undead/humanoid, no affinity stats

**`spacetimedb/src/seeding/ensure_items.ts`**
- Updated comment from "3 Essence variants" to "4 Essence variants"
- Added `upsertMaterial({ name: 'Essence IV', tier: 4n, vendorValue: 24n })` after Essence III

### Task 2 — Combat Reducer Threshold Fix

**`spacetimedb/src/reducers/combat.ts`**
- Added `essenceIVTemplate` lookup after `essenceIIITemplate`
- Replaced 3-tier threshold block (1-5/6-10/11+) with correct 4-tier block:
  - Level 1-10: Essence I
  - Level 11-20: Essence II
  - Level 21-30: Essence III
  - Level 31+: Essence IV

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- `essence_iv` in crafting_materials.ts: 1 match (MATERIAL_DEFS entry)
- `Essence IV` in ensure_items.ts: 1 match (upsertMaterial call)
- `essenceIVTemplate` in combat.ts: 2 matches (lookup + threshold use)
- Old `6n` threshold: no match (removed)
- TypeScript build: `Build finished successfully`

## Self-Check: PASSED

- [x] `spacetimedb/src/data/crafting_materials.ts` — essence_iv entry present at line 128
- [x] `spacetimedb/src/seeding/ensure_items.ts` — Essence IV upsert present at line 1871
- [x] `spacetimedb/src/reducers/combat.ts` — essenceIVTemplate lookup at 2272, used at 2313
- [x] Commits db5994e and 4df1c5c exist in git log
- [x] TypeScript build passes
