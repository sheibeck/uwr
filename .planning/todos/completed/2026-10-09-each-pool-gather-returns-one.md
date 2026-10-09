---
created: 2026-10-09T04:10:52.501Z
title: Each pool gather returns one resource (yield multiplier dial, default x1)
area: general
files:
  - spacetimedb/src/data/density_rules.ts:59 (YIELD_BY_LEVEL { 0: 0n, 1: 1n, 2: 2n, 3: 3n }, D-38)
  - spacetimedb/src/data/density_rules.ts:501 (yieldForLevel)
  - spacetimedb/src/reducers/items_gathering.ts (finish_gather pool path: yield by density level, then the gather dial, then perk and racial bonuses)
---

## Problem

The owner, 2026-10-09, verbatim: "now that we have pools of resources, we should consider making each gather return just one. The fact that you can gather multiple times now on a node means we're getting too many resources per gather instance. That should probably be an admin dial that defaults to x1."

Phase 51.3.1.1 (D-38) made a pool gather yield by density: Abundant x3, Plentiful x2, Sparse x1. With shared pools you gather repeatedly at a place (until the per-player harvest cap), so the per-gather yield on top of repeat gathers gives too many resources.

## Solution

Folded into Phase 51.3.1.1 as decision D-72 (built in Plan 27, the phase's last server plan):
- Each pool gather returns 1 at any non-zero density (`YIELD_BY_LEVEL` 1/1/1 for levels 1-3, 0 at level 0). Density then sets how many gathers a place supports before it runs dry, not how much one gather gives.
- A named multiplier constant (e.g. `GATHER_YIELD_MULTIPLIER = 1`) in `density_rules.ts`, applied to the base yield; Phase 52.5 Admin and Balance Dials turns it into the admin dial (default x1), per the owner's dials-last rule.
- Existing gather perks and racial gather bonuses still add on top (they are character traits), unless the owner says otherwise.
- Tests: yield 1 at levels 1-3, 0 at level 0, the multiplier applied, perks still add.

Close this todo when Plan 27 ships D-72; the dial itself is tracked in Phase 52.5.
