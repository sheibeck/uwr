---
phase: quick-107
plan: 01
subsystem: combat/abilities
tags: [ranger, track, group, puller, guard, client, server]
dependency_graph:
  requires: []
  provides: [puller-guard-ranger-track]
  affects: [useHotbar, use_ability-reducer]
tech_stack:
  added: []
  patterns: [requirePullerOrLog reuse, client-side ability guard]
key_files:
  created: []
  modified:
    - src/composables/useHotbar.ts
    - src/App.vue
    - spacetimedb/src/reducers/items.ts
decisions:
  - Reused existing requirePullerOrLog helper from helpers/group.ts for server guard - identical pattern to start_tracked_combat
  - Guard placed before executeAbilityAction on server (after all other checks) so no cooldown is consumed when blocked
  - groupId and pullerId added as optional props to UseHotbarArgs to avoid breaking existing callers
metrics:
  duration: ~2min
  completed: 2026-02-17
  tasks_completed: 2
  files_modified: 3
---

# Phase quick-107: Fix Ranger Track Ability When in a Group Summary

Client and server guards preventing non-puller group members from activating Ranger Track - client shows blocked message and skips panel open, server blocks ability execution before cooldown is applied.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Client-side puller guard in useHotbar.ts | ebfba62 | src/composables/useHotbar.ts, src/App.vue |
| 2 | Server-side puller guard in use_ability reducer | f1e7252 | spacetimedb/src/reducers/items.ts |

## What Was Built

### Task 1: Client-side guard (useHotbar.ts + App.vue)

Added two optional props to `UseHotbarArgs`:
- `groupId?: Ref<bigint | null | undefined>` - the selected character's groupId
- `pullerId?: Ref<bigint | null>` - the computed puller ID from useGroups

In `onHotbarClick`, modified the `ranger_track` special case to check group/puller status before calling `onTrackRequested()`. When `groupId` is truthy (in a group) AND `pullerId` is known AND the character is NOT the puller, the ability is blocked with "You must be the puller to use this ability" and the Track panel does not open.

In App.vue, added `groupId: computed(() => selectedCharacter.value?.groupId ?? null)` and `pullerId` (already available from `useGroups`) to the `useHotbar()` call.

### Task 2: Server-side guard (items.ts use_ability reducer)

Added `requirePullerOrLog` to the destructured deps in `registerItemReducers`. Added a puller check specifically for `ranger_track` after the cast-time block but before `executeAbilityAction`. Reuses the same `requirePullerOrLog` helper already used by `start_tracked_combat` - returns `{ ok: false }` for non-pullers in groups (calling `fail()` with the message), `{ ok: true }` for solo characters and pullers.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- src/composables/useHotbar.ts - modified with groupId/pullerId props and ranger_track guard
- src/App.vue - modified with groupId and pullerId passed to useHotbar
- spacetimedb/src/reducers/items.ts - modified with requirePullerOrLog in deps and ranger_track guard
- Commits ebfba62 and f1e7252 exist in git log
