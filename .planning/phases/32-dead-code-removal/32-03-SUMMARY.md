---
phase: 32-dead-code-removal
plan: 03
subsystem: ui
tags: [vue, dead-code, cleanup, components, composables]

requires:
  - phase: 32-01
    provides: "Extracted rules and rewired imports, identifying dead frontend code"
provides:
  - "9 legacy/orphaned Vue components deleted"
  - "useCharacterCreation composable stripped of old form-based code"
  - "App.vue cleaned of all dead panel references, handlers, and keyboard shortcuts"
affects: []

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - src/App.vue
    - src/composables/useCharacterCreation.ts

key-decisions:
  - "Kept useCharacterCreation.ts with narrative creation flow instead of deleting entirely -- only old form-based code was dead, narrative flow is active"
  - "Deleted 5 additional orphaned components beyond the 4 planned (CharacterActionsPanel, HotbarPanel, PanelShell, CommandBar, LogWindow)"
  - "Removed J/Q keyboard shortcuts for deleted journal panel"

patterns-established: []

requirements-completed: [CLEAN-04, CLEAN-06]

duration: 13min
completed: 2026-03-09
---

# Phase 32 Plan 03: Legacy Frontend Panels Summary

**Deleted 9 orphaned Vue components and 1916 lines of dead frontend code, cleaned App.vue of all panel references**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-09T19:05:33Z
- **Completed:** 2026-03-09T19:18:27Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Deleted 4 planned legacy panels (CharacterPanel, NpcDialogPanel, QuestPanel, RenownPanel)
- Found and deleted 5 additional orphaned components (CharacterActionsPanel, HotbarPanel, PanelShell, CommandBar, LogWindow)
- Stripped old form-based creation code from useCharacterCreation while preserving active narrative creation flow
- Cleaned App.vue of all imports, template usage, keyboard shortcuts, and handlers for deleted panels
- Verified no new TypeScript errors introduced (pre-existing error count unchanged at ~95)

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete legacy panels and composables** - `0534e03` (feat)
2. **Task 2: Clean App.vue and verify frontend compilation** - `150a665` (feat)

## Files Created/Modified
- `src/components/CharacterPanel.vue` - Deleted (old form-based character creation)
- `src/components/NpcDialogPanel.vue` - Deleted (legacy journal/NPC dialog panel)
- `src/components/QuestPanel.vue` - Deleted (legacy quest display)
- `src/components/RenownPanel.vue` - Deleted (legacy renown/faction panel)
- `src/components/CharacterActionsPanel.vue` - Deleted (orphaned, zero imports)
- `src/components/HotbarPanel.vue` - Deleted (orphaned, zero imports)
- `src/components/PanelShell.vue` - Deleted (orphaned, zero imports)
- `src/components/CommandBar.vue` - Deleted (replaced by NarrativeInput)
- `src/components/LogWindow.vue` - Deleted (replaced by NarrativeConsole)
- `src/composables/useCharacterCreation.ts` - Stripped old form-based code, kept narrative creation flow
- `src/App.vue` - Removed imports, template refs, keyboard shortcuts, handlers for deleted panels

## Decisions Made
- Kept useCharacterCreation.ts rather than deleting it entirely: the narrative creation flow (autoStartCreation, submitCreationInput, creationCombinedEvents, isCreationLlmProcessing) is actively used by App.vue. Only the old form-based creation code (newCharacter, createCharacter, selectedRace, filteredClassOptions) was dead code.
- Deleted 5 additional orphaned components discovered during import graph tracing -- none had any imports anywhere in the codebase.
- Removed journal/quest keyboard shortcuts (J/Q) since the journal FloatingPanel was removed with NpcDialogPanel.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] useCharacterCreation.ts is not fully dead code**
- **Found during:** Task 1
- **Issue:** Plan called for deleting useCharacterCreation.ts entirely, but the narrative creation flow within it is actively imported and used by App.vue (creationCombinedEvents, isCreationLlmProcessing, submitCreationInput, autoStartCreation, isInCreation)
- **Fix:** Stripped only the old form-based creation code (lines 28-101), kept narrative creation flow intact
- **Files modified:** src/composables/useCharacterCreation.ts
- **Verification:** App.vue still imports and uses the composable; build does not introduce new errors
- **Committed in:** 0534e03 (Task 1 commit)

**2. [Rule 2 - Missing Critical] 5 additional orphaned components**
- **Found during:** Task 1 (import graph tracing)
- **Issue:** CharacterActionsPanel, HotbarPanel, PanelShell had zero imports; CommandBar and LogWindow were replaced by narrative components but never deleted
- **Fix:** Deleted all 5 orphaned components
- **Files modified:** 5 component files deleted
- **Verification:** grep confirms no remaining imports anywhere
- **Committed in:** 0534e03 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both deviations were necessary for correctness. Preserving the narrative creation flow prevented breaking active functionality. Deleting 5 additional orphans was extra cleanup within scope.

## Issues Encountered
- Pre-existing TypeScript errors (~95 TS6133 unused variable warnings) exist across the codebase. These are NOT introduced by this plan and do not affect runtime behavior.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Frontend is cleaner with 1916 lines removed
- Remaining unused variables in App.vue (from composable destructuring) are cosmetic warnings, not errors
- Ready for any further cleanup phases

---
*Phase: 32-dead-code-removal*
*Completed: 2026-03-09*
