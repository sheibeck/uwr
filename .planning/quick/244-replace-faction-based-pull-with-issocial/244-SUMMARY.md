---
phase: quick-244
plan: 01
subsystem: combat/seeding
tags: [pull-system, enemy-templates, social-behavior, schema]
dependency_graph:
  requires: []
  provides: [isSocial-field, same-template-pull-filtering]
  affects: [combat-pulls, enemy-template-seeding]
tech_stack:
  added: []
  patterns: [isSocial flag per template, same-template pull candidates]
key_files:
  created: []
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/seeding/ensure_enemies.ts
decisions:
  - "Used --clear-database for local publish since adding isSocial column required migration with no default"
  - "isSocial: false for all solo beasts, spirits, and non-pack animals; true for humanoids, undead, constructs, and pack hunters"
metrics:
  duration: ~10 minutes
  completed: 2026-02-21
  tasks_completed: 3
  files_modified: 3
---

# Phase quick-244 Plan 01: Replace Faction-Based Pull with isSocial Summary

**One-liner:** Per-template `isSocial` flag replaces faction-based pull candidate filtering so adds only come from the same enemy template and only if that template opts in.

## What Was Built

Pull adds previously filtered candidates by matching `factionId`, which caused cross-template adds (Bandits pulling in Hexbinders). This plan replaced that with:

1. A new `isSocial: t.bool().optional()` column on `EnemyTemplate`
2. Pull candidate filter that checks `isSocial === true` AND `template.id === template.id` (same template)
3. All 37 enemy templates explicitly seeded with `isSocial: true` or `isSocial: false`

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add isSocial to EnemyTemplate schema | 26873cf | spacetimedb/src/schema/tables.ts |
| 2 | Replace faction-based pull candidates with isSocial + same-template filter | 7b4c819 | spacetimedb/src/reducers/combat.ts |
| 3 | Seed isSocial on all enemy templates and publish | 8a90b22 | spacetimedb/src/seeding/ensure_enemies.ts |

## Social Classifications

**isSocial: true** (21 templates) — humanoids, undead, constructs, pack hunters:
bandit, hexbinder, graveAcolyte, graveSkirmisher, graveServant, alleyShade, frostboneAcolyte, cinderWraith, ashveilPhantom, ashforgedRevenant, ridgeSkirmisher, sootboundMystic, emberPriest, fenWitch, cinderSentinel, basaltBrute, sootboundSentry, vaultSentinel, thicketWolf, ashJackal, nightRat

**isSocial: false** (16 templates) — solitary beasts, spirits, solo animals:
bogRat, emberWisp, blightStalker, marshCroaker, dustHare, thornSprite, gloomStag, mireLeech, emberhawk, ashenRam, emberling, duskMoth, shadowProwler, bogSpecter, nightfangViper, gloomwingBat

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Schema migration required --clear-database**
- **Found during:** Task 3 publish
- **Issue:** Adding `isSocial` column to an existing table with data requires a default value annotation or database clear. SpacetimeDB rejected the publish with "Adding a column isSocial to table enemy_template requires a default value annotation".
- **Fix:** Used `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb --clear-database -y` for the local publish. This is acceptable for local dev since all data is re-seeded on startup.
- **Files modified:** None (publish flag only)

## Self-Check: PASSED

- `isSocial: t.bool().optional()` exists in EnemyTemplate at line 719 of tables.ts
- `isSocial === true` check in combat.ts pull candidates at line 966
- No `factionId` references in combat.ts (grep returns 0 matches)
- 37 `isSocial` entries in ensure_enemies.ts (one per template)
- Module published to local successfully (exit 0)
- Commits 26873cf, 7b4c819, 8a90b22 verified in git log
