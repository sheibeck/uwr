---
phase: quick-316
plan: 01
subsystem: subscriptions
tags: [optimization, bandwidth, subscriptions, where-filter]
dependency_graph:
  requires: []
  provides: [location-scoped-subscriptions, subscribe-before-unsubscribe]
  affects: [useWorldData, useGameData, App.vue]
tech_stack:
  added: []
  patterns: [WHERE-filtered-subscriptions, subscribe-before-unsubscribe]
key_files:
  created: []
  modified:
    - src/composables/data/useWorldData.ts
    - src/composables/useGameData.ts
    - src/App.vue
decisions:
  - Used standalone ref<bigint | null> in App.vue with watcher on selectedCharacter to break circular dependency
  - Kept all existing rebind (onInsert/onUpdate/onDelete) callbacks for both groups since iter() returns filtered local cache
metrics:
  duration: ~2 minutes
  completed: 2026-02-25T01:57:24Z
---

# Quick 316: SQL WHERE-filtered Subscriptions for Location-Scoped Tables Summary

WHERE-filtered subscriptions for 6 location-scoped tables using subscribe-before-unsubscribe pattern on location change.

## What Changed

Split the 13 world-domain table subscriptions in `useWorldData.ts` into two groups:

**Group A -- Location-scoped (6 tables, WHERE-filtered):**
- `enemy_spawn`, `npc`, `named_enemy`, `resource_node`, `corpse`, `search_result`
- Each uses `SELECT * FROM "table" WHERE "locationId" = X` instead of `SELECT * FROM "table"`
- Reduces bandwidth by only subscribing to rows in the player's current location

**Group B -- Global/template (7 tables, unfiltered SELECT *):**
- `enemy_spawn_member`, `enemy_template`, `enemy_role_template`, `enemy_ability`, `vendor_inventory`, `resource_gather`, `corpse_item`
- These have no `locationId` column and remain unfiltered

**Subscribe-before-unsubscribe pattern:**
When the player changes location, the new location subscription is created FIRST. Only after its `onApplied` callback fires (confirming new data is in the local cache) does the old subscription get unsubscribed. This prevents UI flicker or brief empty states during travel.

**Wiring:**
- `App.vue` creates a `ref<bigint | null>` for `currentLocationId`, synced via a watcher on `selectedCharacter.value?.locationId`
- Passed through `useGameData(currentLocationId)` to `useWorldData(conn, currentLocationId)`
- Avoids circular dependency since `selectedCharacter` is derived from `useGameData` output

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Split useWorldData into location-scoped and global subscriptions | 9be4168 | useWorldData.ts, useGameData.ts, App.vue |

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- TypeScript compiles without new errors (all errors are pre-existing)
- 6 location-scoped SQL queries contain WHERE clauses
- 7 global SQL queries do NOT contain WHERE clauses
- Subscribe-before-unsubscribe pattern visible in location change watcher
- All existing App.vue computed properties (npcsHere, corpsesHere, resourceNodesHere, etc.) preserved unchanged

## Self-Check: PASSED

All files found, all commits verified.
