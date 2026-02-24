---
phase: quick-311
plan: 01
subsystem: ui
tags: [typescript, vue, imports, refactor]

requires:
  - phase: quick-310
    provides: v2 client migration with module_bindings/types
provides:
  - "All 36 client files import bare PascalCase types from module_bindings/types"
  - "stdb-types.ts shim file deleted"
  - "No XxxRow type aliases remain in client code"
affects: []

tech-stack:
  added: []
  patterns:
    - "Import types directly from module_bindings/types with bare PascalCase names"

key-files:
  created: []
  modified:
    - src/composables/useAuth.ts
    - src/composables/useCharacters.ts
    - src/composables/useCharacterCreation.ts
    - src/composables/useCombat.ts
    - src/composables/useCommands.ts
    - src/composables/useCrafting.ts
    - src/composables/useEvents.ts
    - src/composables/useFriends.ts
    - src/composables/useGroups.ts
    - src/composables/useHotbar.ts
    - src/composables/useInventory.ts
    - src/composables/useItemTooltip.ts
    - src/composables/useMovement.ts
    - src/composables/usePlayer.ts
    - src/composables/useTrade.ts
    - src/components/AppHeader.vue
    - src/components/CharacterActionsPanel.vue
    - src/components/CharacterPanel.vue
    - src/components/CombatPanel.vue
    - src/components/FriendsPanel.vue
    - src/components/GroupPanel.vue
    - src/components/HotbarPanel.vue
    - src/components/InventoryPanel.vue
    - src/components/LocationGrid.vue
    - src/components/LogWindow.vue
    - src/components/MapPanel.vue
    - src/components/NpcDialogPanel.vue
    - src/components/QuestPanel.vue
    - src/components/RacialProfilePanel.vue
    - src/components/RenownPanel.vue
    - src/components/StatsPanel.vue
    - src/components/TrackPanel.vue
    - src/components/TradePanel.vue
    - src/components/TravelPanel.vue
    - src/components/VendorPanel.vue
    - src/components/WorldEventPanel.vue

key-decisions:
  - "Removed Row suffix aliases entirely rather than keeping any backward-compatible re-exports"

patterns-established:
  - "Type imports: always from module_bindings/types with bare PascalCase names (Character, not CharacterRow)"

requirements-completed: [QUICK-311]

duration: 7min
completed: 2026-02-24
---

# Quick Task 311: Remove stdb-types.ts Shim Summary

**Eliminated stdb-types.ts indirection layer; all 36 client files now import bare PascalCase types directly from module_bindings/types**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-24T18:47:25Z
- **Completed:** 2026-02-24T18:54:00Z
- **Tasks:** 2
- **Files modified:** 37 (36 consumer files + 1 deleted)

## Accomplishments
- Updated 15 composable files: import path changed and all XxxRow type names stripped to bare PascalCase
- Updated 21 component files: same import path and type name changes
- Deleted src/stdb-types.ts shim file (88 re-export aliases removed)
- Zero new TypeScript errors introduced (all pre-existing errors unchanged)

## Task Commits

Each task was committed atomically:

1. **Task 1: Update 15 composables** - `451f93f` (refactor)
2. **Task 2: Update 21 components and delete stdb-types.ts** - `4e127cd` (refactor)

## Files Created/Modified
- `src/stdb-types.ts` - DELETED (was 88-alias re-export shim)
- 15 composable files in `src/composables/` - Import path and type name updates
- 21 component files in `src/components/` - Import path and type name updates

## Decisions Made
None - followed plan as specified.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Client codebase now uses clean, direct type imports from codegen output
- No shim layer to maintain when module_bindings are regenerated

---
*Quick Task: 311*
*Completed: 2026-02-24*
