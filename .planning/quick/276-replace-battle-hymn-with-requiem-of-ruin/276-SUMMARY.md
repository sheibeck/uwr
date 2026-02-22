---
phase: quick-276
plan: 01
subsystem: bard-class
tags: [bard, abilities, debuff, songs, combat]
dependency_graph:
  requires: []
  provides: [bard_requiem_of_ruin ability]
  affects: [bard song system, tick_bard_songs, bard finale, combat enemy effects]
tech_stack:
  added: []
  patterns: [addEnemyEffect for debuff application, damage_taken effect type]
key_files:
  created: []
  modified:
    - spacetimedb/src/data/abilities/bard_abilities.ts
    - spacetimedb/src/helpers/combat.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/reducers/items.ts
    - spacetimedb/src/schema/tables.ts
    - src/App.vue
decisions:
  - "Requiem of Ruin uses magnitude=3n, roundsRemaining=1n so debuff expires after 1 combat round but refreshes every 6s tick — effectively permanent while song is active"
  - "Requiem stays in DAMAGE_SONGS (requires combat) because it needs enemies to debuff"
  - "Finale case is now separate from Discordant Note — no more fall-through between them"
metrics:
  duration: "~10 minutes"
  completed: "2026-02-21"
  tasks_completed: 2
  files_modified: 6
---

# Phase quick-276 Plan 01: Replace Battle Hymn with Requiem of Ruin Summary

Replaced `bard_battle_hymn` (AoE damage + party heal/mana combo song) with `bard_requiem_of_ruin` — a pure force-multiplier debuff song that applies `damage_taken` (+3 flat damage received) to all active combat enemies every 6 seconds via `addEnemyEffect`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Rename ability and update all bard song key references | 81020d9 | bard_abilities.ts, helpers/combat.ts, reducers/items.ts, App.vue |
| 2 | Replace tick_bard_songs battle hymn case with Requiem of Ruin debuff pulse | be06f43 | reducers/combat.ts, schema/tables.ts |

## What Changed

### bard_abilities.ts
- Renamed `bard_battle_hymn` key to `bard_requiem_of_ruin`
- Updated `name` to `'Requiem of Ruin'`, updated description
- Changed `damageType` from `'magic'` to `'none'`
- Removed `aoeTargets: 'all_enemies'` (not an AoE attack)

### helpers/combat.ts
- Case label: `bard_battle_hymn` → `bard_requiem_of_ruin`
- DAMAGE_SONGS: `['bard_discordant_note', 'bard_requiem_of_ruin']` (requires combat for enemies)
- songNames map: updated entry
- Immediate-on-cast block: Discordant Note block kept as-is; replaced Battle Hymn block with Requiem block that calls `addEnemyEffect(ctx, combatId!, en.id, 'damage_taken', 3n, 1n, 'Requiem of Ruin')` for each active enemy
- Finale switch: separated Discordant Note case (AoE damage) from new Requiem case (applies debuff); removed battle hymn party heal/mana block entirely

### reducers/combat.ts
- Added `addEnemyEffect` to import from `../helpers/combat`
- Replaced `bard_battle_hymn` tick case (AoE damage + mana drain + party heal/mana restore) with `bard_requiem_of_ruin` case that loops over enemies and calls `addEnemyEffect`

### reducers/items.ts
- Both `BARD_SONG_KEYS` arrays: `bard_battle_hymn` → `bard_requiem_of_ruin`
- `songDisplayNames` map: updated entry

### schema/tables.ts
- Updated comment example on `songKey` field

### src/App.vue
- Updated `BARD_SONG_DISPLAY_NAMES` map: `bard_battle_hymn` → `bard_requiem_of_ruin`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated stale comment in schema/tables.ts**
- **Found during:** Task 2 verification
- **Issue:** `schema/tables.ts` songKey field had example comment referencing `bard_battle_hymn`
- **Fix:** Updated comment to reference `bard_requiem_of_ruin`
- **Files modified:** `spacetimedb/src/schema/tables.ts`
- **Commit:** be06f43

## Verification

- `bard_battle_hymn` no longer exists in any source file under `spacetimedb/src/` or `src/`
- `bard_requiem_of_ruin` present in: bard_abilities.ts, helpers/combat.ts (cast case + finale case), reducers/combat.ts (tick case), reducers/items.ts (2 BARD_SONG_KEYS arrays + songDisplayNames), schema/tables.ts (comment), App.vue
- Local publish: `Build finished successfully` — no compile errors

## Self-Check: PASSED

- `spacetimedb/src/data/abilities/bard_abilities.ts` - FOUND: bard_requiem_of_ruin
- `spacetimedb/src/helpers/combat.ts` - FOUND: bard_requiem_of_ruin (3 locations)
- `spacetimedb/src/reducers/combat.ts` - FOUND: bard_requiem_of_ruin + addEnemyEffect
- `spacetimedb/src/reducers/items.ts` - FOUND: bard_requiem_of_ruin (2 locations)
- `src/App.vue` - FOUND: bard_requiem_of_ruin
- Commits 81020d9 and be06f43 - FOUND in git log
