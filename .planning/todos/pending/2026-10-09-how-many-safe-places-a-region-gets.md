---
created: 2026-10-09T19:00:00.000Z
title: How many safe places a region gets - discuss a cap that tightens with danger
area: general
files:
  - spacetimedb/src/data/density_rules.ts:119-127 (HUB_CHANCE_BY_DANGER, SECOND_HUB_PCT 10, HUB_MAX_PER_REGION 2), :158 (MIN_HOST_PLACES 4)
  - spacetimedb/src/data/density_rules.ts:658 hubCountFor
  - spacetimedb/src/data/region_shape.ts:220-233 (hostFloorFlips: the only limit on the model's safe places)
  - spacetimedb/src/helpers/world_gen.ts:762 (the arrival point takes the model's isSafe)
---

## Problem

Owner, 2026-10-09: "put this into our region phase updates we already discussed. Kestrane Saltpans has 3 safe zones. Is that a regional decision, or are we going to end up with too many safe zones. Let's atleast talk about that when we get there."

How it works today (code and local DB read 2026-10-09):
- Hubs are rolled by the server from the region's danger: a hub at 100% up to danger 200, 90% to 350, 70% to 500, 45% to 650, 25% above; a second hub at 10% when the first hit; never more than 2. Hubs are always safe (and get the bind stone and vendor; a station by roll).
- Every other place is safe or not as the AI says (`isSafe` in the reply). The only server limit is the host floor: at least 4 places must be able to hold creatures (not safe, not a hub), so the farthest extra safe places flip to unsafe when needed. So a 10-place region can end up with up to 6 safe places.
- Kestrane Saltpans (danger 422) rolled the rare second hub (Tallowman's Rake-House and Orrow Gate Caravanserai, both with bind stones) and the AI also made Last Lantern Camp safe: 3 safe places out of 9 (plus the safe Edge Beyond doorway).

## Solution

Discuss in Phase 51.3.2.2 World Danger Growth (owner: "Let's atleast talk about that when we get there"). Options:
- A cap on safe places per region that tightens with danger (for example up to 3 near the starting regions, 1-2 in the middle, 0-1 deep out), counting hubs; extra AI-safe places flip to unsafe (as the host floor does today).
- Keep the AI's safe camps but make them not full rest spots (a "quiet" place rather than safe) in deeper regions.
- Whether the second hub should stay possible beyond a danger band.
Numbers go in density_rules as named constants (tuned later in 52.5). Only new generation is affected.
