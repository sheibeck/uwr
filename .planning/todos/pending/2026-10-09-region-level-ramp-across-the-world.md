---
created: 2026-10-09T17:00:00.000Z
title: Region level ramp - check the world climbs (step down at each crossing, cap at 800)
area: general
files:
  - spacetimedb/src/helpers/world_gen.ts:154-170 (computeRegionDanger: source danger + 50..100, cap 800, starter 100)
  - spacetimedb/src/helpers/world_gen.ts:726-745 (writeRegionStart sets the region's dangerMultiplier)
  - spacetimedb/src/data/recipe_rules.ts:217 (areaLevel = max(1, floor(danger / 100) + levelOffset))
  - spacetimedb/src/data/density_rules.ts:155-156 (LEVEL_HOPS_PER_STEP 2, LEVEL_OFFSET_MAX 2: place offsets by hops from the arrival point)
  - spacetimedb/src/helpers/encounters.ts:130-156 (a family card's Lv range = its members' levels at that place)
  - spacetimedb/src/data/xp.ts:1 (MAX_LEVEL 10)
---

## Problem

Owner, 2026-10-09: "How do we determine the level range of a new region? Is it based on the character who discovered it? We have code somewhere that dictates how wild something gets and how more dangerous it gets the further you get away from a starter region. The Kestrane Saltplanes are level 4, even though the previous zone, Sennet Basin was lv 4-7. It's fine if we are slowly ramping up, but I want to know that my world isn't just going to be a flat difficulty."

How it works today (code and local DB read 2026-10-09, no calls):
- Not based on the discoverer. Each region has a `dangerMultiplier`: a starter region is 100; every new region is its source region's danger plus 50 to 100 (picked from the timestamp), capped at 800 (`computeRegionDanger`).
- A place's level = floor(danger / 100) + the place's `levelOffset`. Since Bigger Regions, new places get offset 0 at the arrival point, +1 per 2 hops away, at most +2. A family card's "Lv a-b" is its members' levels there (roles spread it further).
- The local chain climbs: Kesterlane Basin 100 (base Lv 1) -> Tessarine Shelf 169 (1) -> Orrowmere Teeth 259 (2) -> Sennet Basin 327 (3) -> Kestrane Saltpans 422 (4). Sennet's places are offsets 0-3 (The Drowned Weir dungeon is +3, from older generation), so places run Lv 3-6 and its creature cards reach about 7. Kestrane's places are offsets 0-1, Lv 4-5.

So the world is not flat, but:
1. **A step down at each crossing.** A region's arrival point sits at its base, only 0.5-1 level above the previous region's base, while the previous region's far places sit +2 (or +3) above that base. Walking from the far end of Sennet (Lv 6, creatures up to about 7) into Kestrane's arrival (Lv 4) feels like going backwards, which is what the owner noticed.
2. **Slow and noisy climb:** +0.5 to +1 base level per crossing, by timestamp, so two crossings can add as little as one level.
3. **Flat at the top:** the 800 cap means base Lv 8 (Lv 8-10 with offsets) after roughly 7-14 crossings; past that, every new region is the same difficulty. That matches MAX_LEVEL 10 today, but raising the level cap later needs the cap raised too.
4. The climb follows the chain of discovery (each region from its source), which works like distance from the starter region; nothing reads the discoverer's level.

## Solution

TBD (discuss). Options:
- Start a new region at about the level of the place you left: base = the source crossing's level (source base + that edge's offset), so the far end of one region flows into the next without a step down; or keep the base rule and give the arrival point a matching offset.
- A steadier climb: a fixed step per crossing (for example +1 base level), or a minimum of +1 instead of +0.5.
- Revisit the 800 cap together with MAX_LEVEL (52.5 dials, or when the level cap changes).
- Tests: a chain of regions climbs at the agreed rate, no step down at a crossing, the cap behaviour.
Tuning numbers belong to 52.5 (memory systems-then-ux-then-tuning); the rule shape (no step down at a crossing) is a system choice. Moved to its own Phase 51.3.2.2 World Danger Growth (owner, 2026-10-09: "let's move this todo to it's own phase to revisit world danger growth").
