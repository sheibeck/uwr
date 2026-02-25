---
phase: quick-321
plan: 01
subsystem: client-ui
tags: [bugfix, npc, quests, journal, subscriptions]
dependency-graph:
  requires: []
  provides: [global-npc-subscription, quest-giver-resolution]
  affects: [useQuestData, NpcDialogPanel, App.vue]
tech-stack:
  added: []
  patterns: [global-subscription-for-cross-location-data]
key-files:
  created: []
  modified:
    - src/composables/data/useQuestData.ts
    - src/components/NpcDialogPanel.vue
    - src/App.vue
decisions:
  - "Used global NPC subscription in useQuestData rather than moving NPC sub out of useWorldData"
  - "Applied allNpcs to ALL NPC lookups (journal + quests) per user clarification, not just quest tab"
metrics:
  duration: "4m 2s"
  completed: "2026-02-25T04:31:10Z"
---

# Quick Task 321: Fix Quests Showing Unknown Location Summary

Global NPC subscription added to useQuestData so quest giver name/location and journal NPC data resolve correctly regardless of player location.

## What Changed

### Root Cause
`useWorldData.ts` subscribes to NPCs with `WHERE locationId = currentLocationId`. When the player travels away from a quest giver's location, the NPC row leaves the local SpacetimeDB cache. The `questRows` and journal computeds in `NpcDialogPanel.vue` looked up NPCs from this location-scoped `npcs` array and got null, displaying "Unknown".

### Fix
Added a global (unfiltered) `SELECT * FROM npc` subscription in `useQuestData.ts` alongside existing quest subscriptions. This ensures all NPC rows are always available in the client cache. The new `allNpcs` ref is wired through `useGameData` (via spread) to `App.vue` and passed as a prop to `NpcDialogPanel.vue`.

All NPC lookups in `NpcDialogPanel.vue` (quest tab's `questRows`, journal tab's `npcFilters`, `dialogEntries`, `selectedNpcData`) now use `props.allNpcs` instead of the location-scoped `props.npcs`.

### Files Modified

| File | Change |
|------|--------|
| `src/composables/data/useQuestData.ts` | Added `allNpcs` shallowRef, global NPC subscription query, rebind callback, and return export |
| `src/App.vue` | Added `allNpcs` to useGameData destructuring; passed `:all-npcs` prop to NpcDialogPanel |
| `src/components/NpcDialogPanel.vue` | Added `allNpcs: Npc[]` prop; switched all 4 NPC lookups from `props.npcs` to `props.allNpcs` |

## Task Completion

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Add global NPC subscription and wire to NpcDialogPanel | `18f4bfe` | Complete |

## Deviations from Plan

### User-Directed Scope Extension

**1. [User Clarification] Applied allNpcs to journal tab, not just quest tab**
- **Plan said:** Journal tab NPC list still shows only NPCs at current location
- **User clarified:** ALL NPC dialog should be accessible regardless of player location
- **Action:** Changed `npcFilters`, `dialogEntries`, and `selectedNpcData` to also use `allNpcs` instead of location-scoped `npcs`

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added allNpcs to App.vue destructuring**
- **Found during:** Task 1
- **Issue:** Plan did not mention that `useGameData` return values are explicitly destructured in App.vue (not just used via template). The spread makes `allNpcs` available on the object, but App.vue destructures specific properties.
- **Fix:** Added `allNpcs` to the destructuring on line 631 of App.vue
- **Commit:** `18f4bfe`

## Verification

- Build succeeds (no new errors; only pre-existing TS6133 warnings)
- `allNpcs` wiring confirmed: useQuestData -> useGameData (via spread) -> App.vue (destructured) -> NpcDialogPanel (prop) -> all NPC lookup computeds
- Quest tab uses `allNpcs` for giver/location resolution
- Journal tab uses `allNpcs` for NPC list, dialog entries, and selected NPC data
- No server-side changes needed (NPC table is already public)

## Self-Check: PASSED

- All 3 modified files exist on disk
- Commit `18f4bfe` verified in git log
