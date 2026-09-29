---
phase: 38-platform-upgrade
plan: 02
subsystem: tooling
tags: [vue-tsc, type-cleanup, hotbar, app-vue]
requires: [38-01]
provides:
  - src/App.vue type-clean under unchanged strict tsconfig (0 vue-tsc errors)
  - Project-wide vue-tsc exit 0; `npm run build` green on the current toolchain
  - Number-key hotbar shortcuts restored (quick-284 feature)
affects: [38-03]
tech-stack:
  added: []
  patterns:
    - "Template event helpers (eventTargetRect, setHoverBackground) instead of $event.currentTarget access, which is typed EventTarget | null"
key-files:
  created: []
  modified:
    - src/App.vue
key-decisions:
  - "Unused composable destructures reduced to bare calls (useMovement, useContextActions) so subscriptions/watchers still run"
  - "Unused useReducer bindings deleted outright"
requirements-completed: [SC-6]
metrics:
  tasks: 2
  files_changed: 1
  app-vue-vue-tsc-errors: "106 -> 0"
  project-vue-tsc-errors: "106 -> 0"
completed: 2026-09-29
status: complete
---

# Phase 38 Plan 02: App.vue Type Cleanup Summary

`src/App.vue` went from 106 to 0 vue-tsc errors with `noUnusedLocals`/`noUnusedParameters` still on. With plan 38-01, project-wide `vue-tsc --noEmit -p tsconfig.json` now exits 0, `npm run build` (vue-tsc -b && vite build) is green, and root Vitest passes (19 files, 513 tests).

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | Fix the 14 real type errors | 9757662b |
| 2 | Remove unused declarations (92 + cascade) | a0141714 |

## Results

- vue-tsc counts for src/App.vue: before 106 (92 TS6133 + 14 real), after task 1 92 (all TS6133), after task 2 0. Project-wide exit code 0.
- Composable-inventory diff (`use[A-Z]*(` calls, excluding useReducer/useAbility/useAbilityRealtime/useItem): EMPTY. The 25 project composable calls are identical before and after.
- `watch(` count 23 -> 23; `onMounted/onBeforeUnmount/onUnmounted` count 2 -> 2.
- `as any | @ts-ignore | @ts-expect-error` count 34 -> 32 (dropped only because deleted dead code contained two `as any`); none added.
- `tsconfig.json` untouched. The only file changed by this plan's code commits is `src/App.vue` (CRLF endings preserved).
- `vite build` succeeds. Root Vitest 513/513. (`spacetimedb/` was not touched by this plan; 38-01 recorded 478/478.)

## Deviations from Plan

### DEVIATION 1 (latent-bug removal): dead `ranger_track` useAbility call removed

- **Where:** `selectTrackedTarget` in `src/App.vue`.
- **Change:** deleted `useAbility('ranger_track', selectedCharacter.value.id)`. `startTrackedCombat(templateId)` and `closePanelById('track')` remain.
- **Why:** the call passed a legacy string key where a bigint (u64) is required. The SDK's u64 writer throws before the reducer is sent, so `startTrackedCombat` never ran. No 'track' kind exists in `ABILITY_KINDS`, so the TrackPanel select flow is unreachable in v2.
- **Effect on behavior:** none reachable. `useAbility` became an unused destructure from `useHotbar` and was dropped from the pattern.
- **Follow-up:** re-wire the track ability id, or delete TrackPanel and the `onTrackRequested` path.
- **Commit:** 9757662b

### DEVIATION 2 (behavior restored): number-key hotbar shortcuts work again

- **Where:** `handleHotbarKeydown` in `src/App.vue`.
- **Change:** guard changed from `if (!slot?.abilityKey) return;` to `if (!slot?.abilityTemplateId) return;`.
- **Why:** quick-284 (0d45c84f) added the shortcuts guarded on `abilityKey`; phase 28-03 (892122a1) renamed the hotbar model to `abilityTemplateId` and missed this guard, so shortcuts have silently done nothing since.
- **Effect on behavior (user-visible):** keys 1-9 and 0 pressed outside text inputs now fire hotbar slots 1-10 via `onHotbarClick`, which applies the existing cooldown, cast, combat-turn and resource guards. To be verified at the 38-08 human check.
- **Revert:** the single line `if (!slot?.abilityTemplateId) return;` in `handleHotbarKeydown` (restore `abilityKey` to get the dead behavior back, though that will not type-check).
- **Commit:** 9757662b

### Other real-error fixes (type-only, no behavior change)

- `:disabled` on hotbar button wrapped in `Boolean(...)`.
- `eventTargetRect(e: MouseEvent)` and `setHoverBackground(e: MouseEvent, background: string)` helpers replace `$event.currentTarget` access in templates (exact colors preserved).
- Removed excess args never read by the composables: `races` (useCharacterCreation); `inventoryItems`, `itemTemplates`, `eatFoodFn` (useHotbar).
- Annotated `(entry: string)` in the terrain split/map/filter chain.
- Deleted unused `onAddItemToHotbar` and `onAddAbilityToHotbar` (their `setHotbarSlot` string-vs-bigint call was the type error).

### Cascade removals in Task 2 (all unused-only, tool-detected)

After the 92 listed declarations were removed, these became unused and were removed too: `races`, `useAbility` (destructure names), the imports `ADMIN_IDENTITY_HEX`, and the reducer bindings `hailNpcReducer`, `lootAllCorpseReducer`, `deleteItemReducer`, `inviteToGroupReducer` (useReducer only flushes its own queue), plus `aggroEntries`, `corpses`, `corpseItems`, `deselectCharacter`, `combatLocked`, `conStyleForDiff`, `currentRegionLevel`, `otherCharacterId`, `persistAccordionState` (destructure names or helpers used only by deleted code). The `useGameData` and similar composable calls themselves are kept.

Note: the comment on the removed `LocationGrid` import ("travel UI uses LocationGrid in the travel FloatingPanel") remains in App.vue as historical text and is now slightly stale.

## Known Stubs

None.

## Threat Flags

None. T-38-04 mitigated (composable/watch/lifecycle inventories unchanged). T-38-05 accepted: restored hotkeys go through the existing guarded `onHotbarClick`; the server remains authoritative.

## Self-Check: PASSED

- Commits 9757662b and a0141714 exist in git log.
- `grep -c "if (!slot?.abilityTemplateId) return;" src/App.vue` = 1; `eventTargetRect` and `setHoverBackground` present.
