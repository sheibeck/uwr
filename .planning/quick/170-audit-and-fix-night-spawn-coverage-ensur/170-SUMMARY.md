---
phase: quick-170
plan: 01
subsystem: database
tags: [spacetimedb, enemies, spawning, night, seeding]

requires:
  - phase: quick-169
    provides: zero-offset exact-match spawn logic (spawnEnemy and ensureAvailableSpawn)

provides:
  - 8 new night enemy templates with 16 role templates and 8 enemy abilities
  - Level-1 plains night coverage (Dusk Moth + Night Rat)
  - Level-1 swamp night coverage (Nightfang Viper)
  - Level-1 woods+mountains night coverage (Gloomwing Bat)
  - Level-3 plains+mountains night coverage (Cinder Wraith)
  - Level-4 woods night coverage (Shadow Prowler)
  - Level-4 swamp night coverage (Bog Specter)
  - Level-5 mountains night coverage (Ashveil Phantom)

affects: [enemy-spawning, night-cycle, combat, location-enemy-templates]

tech-stack:
  added: []
  patterns: [addEnemyTemplate + addRoleTemplate + upsertEnemyAbility seeding pattern for new enemies]

key-files:
  created: []
  modified:
    - spacetimedb/src/seeding/ensure_enemies.ts
    - spacetimedb/src/seeding/ensure_world.ts

key-decisions:
  - "All new night enemy templates use armorClass: 0n per decision #150 (enemy AC is role-driven via ENEMY_ROLE_CONFIG)"
  - "Cinder Wraith covers both plains AND mountains (terrainTypes: plains,mountains) to provide L3 coverage for mountain locations too"

duration: ~3min
completed: 2026-02-18
---

# Quick Task 170: Night Spawn Coverage Audit and Fix Summary

**8 thematically nocturnal enemy templates (moths, rats, wraiths, prowlers, bats, vipers, phantoms) added to fill all night spawn gaps identified in audit — every non-safe, non-dungeon location now has at least one level-appropriate night enemy**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-18T13:32:54Z
- **Completed:** 2026-02-18T13:35:30Z
- **Tasks:** 2 (code + publish)
- **Files modified:** 2

## Accomplishments

- Identified and filled 8 night spawn gaps across all terrain types and level ranges
- Level-1 plains (Ashen Road, Ironbell Farmstead) now spawn Dusk Moth (spirit) and Night Rat (animal) at night
- Level-1 swamp locations gain Nightfang Viper; woods+mountains gain Gloomwing Bat
- Level-3 plains (Cinderwatch, Scoria Flats) gain Cinder Wraith; level-4 woods gain Shadow Prowler; level-4 swamp gains Bog Specter
- Level-5 mountains (Ironvein Pass, Pyre Overlook) gain Ashveil Phantom
- Module republished successfully with `--clear-database` for clean reseed — no errors during init

## Task Commits

1. **Task 1: Add missing night enemy templates with roles and abilities** - `46ee85f` (feat)
2. **Task 2: Republish module** - no code commit (deployment action only)

**Plan metadata:** see SUMMARY commit below

## Files Created/Modified

- `spacetimedb/src/seeding/ensure_enemies.ts` - Added 8 enemy templates (Dusk Moth, Night Rat, Cinder Wraith, Shadow Prowler, Bog Specter, Ashveil Phantom, Nightfang Viper, Gloomwing Bat) each with 2 role templates
- `spacetimedb/src/seeding/ensure_world.ts` - Added 8 enemy abilities in `ensureEnemyAbilities()` (moth_dust, plague_bite, spectral_flame, shadow_pounce, drowning_grasp, soul_rend, venom_fang, sonic_screech)

## Coverage After Changes

| Location | Terrain | Level | Night Enemies Available |
|----------|---------|-------|------------------------|
| Ashen Road | plains | 1 | Dusk Moth (L1), Night Rat (L1) |
| Ironbell Farmstead | plains | 1 | Dusk Moth (L1), Night Rat (L1) |
| Fogroot Crossing | swamp | 2 | Nightfang Viper (L1), Blight Stalker (L3) |
| Willowfen | swamp | 2 | Nightfang Viper (L1), Fen Witch (L3) |
| Duskwater Shallows | swamp | 2 | Nightfang Viper (L1), Blight Stalker (L3) |
| Bramble Hollow | woods | 2 | Gloomwing Bat (L1), Thorn Sprite (L2) |
| Thornveil Thicket | woods | 2 | Gloomwing Bat (L1), Blight Stalker (L3) |
| Lichen Ridge | mountains | 2 | Gloomwing Bat (L1), Ember Wisp (L2) |
| Cairn Meadow | plains | 2 | Dusk Moth (L1), Ember Wisp (L2) |
| Cinderwatch | plains | 3 | Cinder Wraith (L3), Ember Wisp (L2) |
| Scoria Flats | plains | 3 | Cinder Wraith (L3), Ember Wisp (L2) |
| Charwood Copse | woods | 4 | Shadow Prowler (L4), Blight Stalker (L3) |
| Smolder Marsh | swamp | 4 | Bog Specter (L4), Fen Witch (L3) |
| Ironvein Pass | mountains | 5 | Ashveil Phantom (L5), Frostbone Acolyte (L4) |
| Pyre Overlook | mountains | 5 | Ashveil Phantom (L5), Frostbone Acolyte (L4) |

## Decisions Made

- All new templates use `armorClass: 0n` per decision #150 (enemy AC is role-driven via ENEMY_ROLE_CONFIG)
- Cinder Wraith covers `terrainTypes: 'plains,mountains'` to provide L3 coverage for both terrain types
- Gloomwing Bat covers `terrainTypes: 'woods,mountains'` for L1 bat coverage across two terrain families

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Pre-existing TypeScript errors in unrelated files (combat.ts, items.ts, movement.ts, social.ts) were present before this task and are not related to night spawn coverage.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Night spawn coverage complete for all non-safe, non-dungeon locations
- Players can now encounter appropriate nocturnal enemies when playing during night time in starter zones (Ashen Road, Ironbell Farmstead)
- Enemy templates are automatically assigned to locations via `ensureLocationEnemyTemplates` on next module startup

---
*Phase: quick-170*
*Completed: 2026-02-18*
