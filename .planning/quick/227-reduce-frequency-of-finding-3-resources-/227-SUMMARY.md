# Quick Task 227 — Reduce frequency of finding 3 resources on location search

**Date:** 2026-02-21
**Commit:** 4a92008

## What changed

`spacetimedb/src/helpers/search.ts` — node count tier thresholds adjusted:

| Tier | Before | After |
|------|--------|-------|
| 3 nodes | roll ≥ 80 (20% of finds) | roll ≥ 90 (10% of finds) |
| 2 nodes | roll ≥ 65 (15% of finds) | roll ≥ 70 (20% of finds) |
| 1 node  | roll ≥ 35 (30% of finds) | roll ≥ 35 (35% of finds) |

3-node finds are now half as common. 2-node is slightly more common, and 1-node picks up the rest.
