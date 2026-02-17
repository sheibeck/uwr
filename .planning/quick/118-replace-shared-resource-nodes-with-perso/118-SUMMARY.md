---
phase: quick-118
plan: 01
subsystem: resource-gathering
tags: [resource-nodes, passive-search, personal-discovery, gathering]
dependency_graph:
  requires: [passive-search-system, resource-node-schema]
  provides: [personal-resource-nodes, character-scoped-gathering]
  affects: [ResourceNode-table, performPassiveSearch, finish_gather, resourceNodesHere]
tech_stack:
  added: []
  patterns: [optional-characterId-ownership, cleanup-on-entry, delete-not-deplete]
key_files:
  created: []
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/helpers/location.ts
    - spacetimedb/src/helpers/search.ts
    - spacetimedb/src/reducers/items.ts
    - src/App.vue
    - src/module_bindings/resource_node_type.ts
decisions:
  - "Personal nodes deleted immediately after gathering (no respawn timer)"
  - "2 or 3 nodes spawned per successful search roll (seed % 2n gives 0 or 1)"
  - "seedOffset = BigInt(i) * 1000n differentiates resource types across multiple spawns"
  - "Old personal nodes cleaned up on every location entry regardless of search outcome"
  - "Shared nodes (characterId undefined) retain full deplete+respawn legacy path"
metrics:
  duration: 2min
  completed: 2026-02-17
---

# Quick Task 118: Replace Shared Resource Nodes with Personal Per-Character Nodes Summary

Personal resource nodes discovered via passive search (65% roll), scoped to discovering character, deleted after gathering with no respawn.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Backend schema and helper changes | 5712db4 | tables.ts, location.ts, search.ts |
| 2 | Gather completion and client filtering | 099af04 | items.ts, App.vue, module_bindings/ |

## What Was Built

### Schema Change
`ResourceNode` table gained an optional `characterId: t.u64().optional()` field after `locationId`, plus a new `by_character` btree index alongside the existing `by_location` index.

### spawnResourceNode Enhancement
The function now accepts two optional parameters: `characterId?: bigint` (scopes the node to a specific character) and `seedOffset?: bigint` (offsets the roll seed to produce varied resource types across multiple spawns in one batch). Both default to `undefined`/`0n` for backward compatibility.

### Bootstrap Change
`ensureLocationRuntimeBootstrap` no longer calls `ensureResourceNodesForLocation`. Pre-spawned shared resource nodes at every location are eliminated. The `ensureResourceNodesForLocation` function remains exported for any remaining callers.

### Passive Search Enhancement
`performPassiveSearch` in `search.ts` now:
1. Imports `spawnResourceNode` from `./location`
2. On every location entry, deletes any existing personal nodes for the character at that location (stale cleanup)
3. When `foundResources` is true (65% roll): spawns 2 or 3 personal nodes (`2 + Number(seed % 2n)`), each with `seedOffset = BigInt(i) * 1000n` for varied resource types

### Gather Completion
`finish_gather` reducer branches on `node.characterId`:
- If set (personal node): `ctx.db.resourceNode.id.delete(node.id)` — immediate deletion, no respawn scheduled
- If unset (shared node): existing deplete + `ResourceRespawnTick` insert unchanged

### Client Filter
`resourceNodesHere` computed in `App.vue` now applies a characterId filter between the locationId filter and state filter, showing shared nodes (no characterId) OR personal nodes belonging to the selected character.

### Bindings Regenerated
`src/module_bindings/resource_node_type.ts` now includes `characterId: __t.option(__t.u64())`.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- spacetimedb/src/schema/tables.ts: characterId field and by_character index present
- spacetimedb/src/helpers/location.ts: spawnResourceNode accepts characterId and seedOffset; ensureLocationRuntimeBootstrap does not call ensureResourceNodesForLocation
- spacetimedb/src/helpers/search.ts: imports spawnResourceNode, spawns personal nodes, cleans up old personal nodes
- spacetimedb/src/reducers/items.ts: node.characterId branching logic at line 720
- src/App.vue: characterId filter in resourceNodesHere at lines 1691-1693
- src/module_bindings/resource_node_type.ts: characterId field present
- Commits 5712db4 and 099af04 exist
