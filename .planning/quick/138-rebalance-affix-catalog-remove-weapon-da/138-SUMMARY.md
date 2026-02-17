---
phase: quick-138
plan: 01
subsystem: loot-gear
tags: [affixes, balance, loot, weaponBaseDamage]
dependency_graph:
  requires: [14-loot-gear-progression]
  provides: [rebalanced-affix-catalog]
  affects: [item-generation, loot-pipeline, legendary-drops]
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified:
    - spacetimedb/src/data/affix_catalog.ts
decisions:
  - "weaponBaseDamage removed entirely — stat affixes (strBonus) are the correct primary damage driver"
  - "fierce prefix added (strBonus, minTier=2) to replace keen as second weapon prefix option"
  - "HP affix legendary caps: armor 35→25, accessory 25→18 — prevents >40% base HP from two affixes"
  - "AC affix legendary caps: sturdy/resilience 5→4, fortified 8→6 — one affix worth of AC max"
  - "MR affix legendary caps trimmed: warded 6→5, of_warding 7→5"
  - "Ironveil legendary magnitudes brought to new catalog caps (fortified 8→6, of_endurance 35→25)"
  - "Dreadmaw legendary: keen/weaponBaseDamage replaced with mighty/strBonus 4n — coherent STR axe"
metrics:
  duration: "~2 minutes"
  completed: "2026-02-17"
  tasks: 2
  files: 1
---

# Phase quick-138: Rebalance Affix Catalog — Remove weaponBaseDamage Summary

**One-liner:** Removed weaponBaseDamage affix type to eliminate STR double-dipping, added fierce prefix as replacement, trimmed HP/AC/MR legendary magnitude caps, updated Dreadmaw and Ironveil legendaries to match new catalog, republished module with clear-database.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Rewrite affix_catalog.ts — remove weaponBaseDamage, rebalance magnitudes | 1be5623 | spacetimedb/src/data/affix_catalog.ts |
| 2 | Publish module to resync affix data in database | (no commit — publish only) | N/A |

## Verification Results

1. `grep "weaponBaseDamage" spacetimedb/src/data/affix_catalog.ts` — **0 results** (pass)
2. Dreadmaw legendary: affixKey='mighty', statKey='strBonus', magnitude=4n — **confirmed**
3. vital/of_endurance legendary tier = 25n (was 35n) — **confirmed**
4. sturdy/of_resilience legendary tier = 4n (was 5n) — **confirmed**
5. fortified legendary tier = 6n (was 8n) — **confirmed**
6. Module published with no compile errors or runtime panics — **confirmed** ("Database initialized")

## Changes Made

### PREFIXES

| Affix | Change |
|-------|--------|
| `keen` (weaponBaseDamage [2,4,7,10]) | **Removed entirely** |
| `fierce` (strBonus) | **Added** — minTier=2, [0,2,3,4] |
| `sturdy` (armorClassBonus) | [1,2,3,5] → [1,2,3,4] |
| `vital` (hpBonus) | [5,10,20,35] → [5,8,15,25] |
| `warded` (magicResistanceBonus) | [1,2,4,6] → [1,2,3,5] |
| `fortified` (armorClassBonus) | [0,3,5,8] → [0,2,4,6] |

### SUFFIXES

| Affix | Change |
|-------|--------|
| `of_endurance` (hpBonus) | [5,10,20,35] → [5,8,15,25] |
| `of_warding` (magicResistanceBonus) | [0,2,4,7] → [0,2,3,5] |
| `of_resilience` (armorClassBonus) | [1,2,3,5] → [1,2,3,4] |
| `of_vigor` (hpBonus accessory) | [5,10,15,25] → [3,6,10,18] |

### LEGENDARIES

| Legendary | Change |
|-----------|--------|
| Dreadmaw | First affix: keen/weaponBaseDamage/10n → mighty/strBonus/4n |
| Ironveil | fortified magnitude: 8n → 6n; of_endurance magnitude: 35n → 25n |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- spacetimedb/src/data/affix_catalog.ts: FOUND
- Commit 1be5623: FOUND
