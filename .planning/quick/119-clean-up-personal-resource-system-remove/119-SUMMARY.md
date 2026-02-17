---
phase: quick-119
plan: 01
subsystem: resource-system
tags: [cleanup, resource-nodes, ui, search]
dependency_graph:
  requires: [quick-118]
  provides: [personal-resource-system-finalized]
  affects: [spacetimedb/src/helpers/location.ts, spacetimedb/src/helpers/search.ts, spacetimedb/src/reducers/items.ts, spacetimedb/src/schema/tables.ts, spacetimedb/src/schema/scheduled_tables.ts, spacetimedb/src/index.ts, spacetimedb/src/seeding/ensure_content.ts, src/components/LocationGrid.vue]
tech_stack:
  added: []
  patterns: [tiered-probability-tiers, personal-node-cleanup]
key_files:
  created: []
  modified:
    - spacetimedb/src/helpers/location.ts
    - spacetimedb/src/helpers/search.ts
    - spacetimedb/src/reducers/items.ts
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/schema/scheduled_tables.ts
    - spacetimedb/src/index.ts
    - spacetimedb/src/seeding/ensure_content.ts
    - src/components/LocationGrid.vue
decisions:
  - "Resource node count tiered by roll value: 1 node (65-74), 2 nodes (75-84), 3 nodes (85-99)"
  - "Resource badge removed from SEARCH section; resources discovered silently via log only"
  - "finish_gather always deletes nodes immediately — no shared-node branch needed"
metrics:
  duration: 2min
  completed: 2026-02-16
  tasks: 2
  files: 8
---

# Phase quick-119 Plan 01: Clean Up Personal Resource System Summary

Finalized personal resource node system by removing all shared/public spawning remnants, implementing tiered node discovery counts, updating log messaging, and removing the resource badge from the SEARCH UI section.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Remove shared resource spawning and ResourceRespawnTick | 83e3c6f | location.ts, items.ts, tables.ts, scheduled_tables.ts, index.ts, ensure_content.ts |
| 2 | Fix search log message, implement tiered node count, remove resource badge | ed5a37a | search.ts, LocationGrid.vue |

## What Was Built

Cleaned up the backend and frontend after quick-118 introduced personal per-character resource nodes. The codebase previously had dual-path logic (personal nodes delete immediately, shared nodes deplete+respawn), plus a ResourceRespawnTick scheduled table that was no longer needed. All of that dead weight is now removed.

The SEARCH section no longer shows a "Hidden resources detected nearby" badge — resources are discovered silently. If the search only found resources (no quest item or named enemy), the section shows "Nothing unusual detected." This keeps the UI clean and avoids leaking implementation detail.

Node count is now tiered based on the resourceRoll value within the discovery range (65-99):
- Roll 65-74: 1 node (10/35 of discovery range, ~29%)
- Roll 75-84: 2 nodes (10/35 of discovery range, ~29%)
- Roll 85-99: 3 nodes (15/35 of discovery range, ~43%)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `spacetimedb/src/helpers/location.ts` modified: confirmed (no ensureResourceNodesForLocation/respawnResourceNodesForLocation)
- `spacetimedb/src/helpers/search.ts` modified: confirmed (tiered nodeCount, new log message)
- `spacetimedb/src/reducers/items.ts` modified: confirmed (no respawn_resource reducer, no shared branch)
- `spacetimedb/src/schema/tables.ts` modified: confirmed (no ResourceRespawnTick definition)
- `src/components/LocationGrid.vue` modified: confirmed (no resource badge)
- Commit 83e3c6f exists: confirmed
- Commit ed5a37a exists: confirmed
