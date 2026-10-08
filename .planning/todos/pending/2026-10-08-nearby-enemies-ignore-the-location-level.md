---
created: 2026-10-08T12:00:00.000Z
title: Nearby enemies stay level 1 in higher-level places
area: general
files:
  - spacetimedb/src/helpers/location.ts:24-33 (computeLocationTargetLevel)
  - spacetimedb/src/helpers/location.ts:380-430 (spawnEnemy level filter and fallback)
  - spacetimedb/src/helpers/location.ts:270-285 (reuse of an existing spawn)
  - spacetimedb/src/helpers/world_gen.ts:789-860 (writeRegionFill enemies, level clamped to base±1)
---
## Problem

The owner, 2026-10-08, verbatim: "as I travel around to different zone currently, I'm noticing the nearby enemies seem to all be level 1. Even though I went into a level 4-6 zone. I'm looking at Armond, who is currently in Kesterlane Basin · Mother Pan Undercroft"

### Local data (2026-10-08)

| Item | Value |
|---|---|
| Location | `Mother Pan Undercroft` (id 5, region 1 Kesterlane Basin, terrain `dungeon`) |
| `levelOffset` | 4 |
| Region `dangerMultiplier` | 100 |
| Target level | 1 × 100/100 + 4 = 5, so the place reads as level 4-6 |
| Spawns there | three `Salt-Crust Skitterer` (template 1) and one `Brine Sentinel` (template 3), all level 1 |
| Region 1 enemy templates | ids 1-3, all level 1 |

### Likely cause, in `spawnEnemy`

1. It takes the location's enemy templates from `location_enemy_template`.
2. It keeps those within ±1 of the target level (4-6).
3. None qualify, so it falls back to `viable = candidates`: every template, all level 1.
4. The spawn keeps the template's stored level. Nothing scales a spawned enemy to the place's level.

The underlying gap is in world generation. `writeRegionFill` creates 2-3 enemy types per region with the level clamped to the region base ±1, so a region whose base is 1 never gets a type that fits a +4 place.

The client shows the template level, so Nearby, cons and pull difficulty all read level 1. Combat probably uses the template stats too. Confirm that.

## Solution

Options, to settle before fixing. This may fold into 51.3.1 Combat Dials (difficulty).

- **(a) Scale a spawn to its place.** When no template fits, spawn the closest template at the place's target level. Stats come from the existing level formulas (`writeRegionFill` derives HP, damage and armor from level), stored per spawn or computed at fight start.
- **(b) Fix generation.** World generation makes enemy types for each place's level range (base plus each `levelOffset`). This is a prompt or schema change, and prompt wording needs owner approval.
- **(c) Both.** (b) for variety, (a) as the safety net.

Check the existing spawns and pull_state, and the con colours in Nearby. Add tests:
- a +4 place spawns level 4-6 enemies;
- the fallback never drops below the place's level band.
