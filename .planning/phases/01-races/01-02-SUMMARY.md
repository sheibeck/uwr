---
phase: 01-races
plan: 02
subsystem: ui
tags: [vue, spacetimedb, typescript, races, character-creation, composables]

# Dependency graph
requires:
  - phase: 01-races-01
    provides: Race table in SpacetimeDB, tables.race bindings, createCharacter reducer with raceId param
provides:
  - Race picker dropdown in character creation with 4 unlocked races
  - Race description and stat bonus display below dropdown
  - Class dropdown filtered by selected race's availableClasses restriction
  - Class auto-clear when switching to a race that doesn't allow current class
  - createCharacter call sends raceId (bigint) to backend
  - Character list displays race display name from Character row
affects: [02-hunger, character-creation, class-validation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Composable separation: useGameData owns table subscriptions, useCharacterCreation owns form state and business logic"
    - "filteredClassOptions returns null for 'all allowed' and string[] for restricted — null check drives UI completeness"
    - "Props-down / emit-up pattern for newCharacter state in CharacterPanel — parent App.vue owns state, component emits updates"
    - "Class clear on race switch done inline in onRaceChange using direct races prop lookup, not waiting for parent recompute"

key-files:
  created: []
  modified:
    - src/composables/useGameData.ts
    - src/composables/useCharacterCreation.ts
    - src/components/CharacterPanel.vue
    - src/App.vue

key-decisions:
  - "filteredClassOptions returns null (not empty array) when all classes are allowed — null = Human/unrestricted, array = filtered list"
  - "Class clear logic runs in onRaceChange using races prop directly, not waiting for Vue to recompute filteredClassOptions from parent"
  - "selectedRaceRow and filteredClassOptions computed in useCharacterCreation (not in CharacterPanel) — keeps component prop-simple"

patterns-established:
  - "Race info block shows description + non-zero stat bonuses + classes restriction (only when non-empty availableClasses)"
  - "unlockedRaces computed in component filters races prop by r.unlocked — component never assumes all passed rows are unlocked"

# Metrics
duration: ~15min
completed: 2026-02-11
---

# Phase 1 Plan 2: Race Selection Frontend UI

**Race picker dropdown in CharacterPanel with class filtering, stat bonus display, and raceId wired to createCharacter reducer**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-02-12 (continuation from checkpoint)
- **Completed:** 2026-02-12
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint)
- **Files modified:** 4

## Accomplishments
- Race picker `<select>` in CharacterPanel shows all 4 unlocked races from the Race table subscription
- Selecting a race renders description and non-zero stat bonuses (e.g., Ironclad shows STR +2, Eldrin shows WIS +1 INT +2)
- Class dropdown filters to only the classes allowed by the selected race; Human shows all classes
- Switching races clears the current class selection if it is no longer valid for the new race
- `createCharacter` reducer call passes `raceId: BigInt(newCharacter.value.raceId)` — raceId flows correctly to backend
- Human-verified end-to-end: dropdown, filtering, character creation with racial stat bonuses all confirmed working

## Task Commits

Each task was committed atomically:

1. **Task 1: Add races to useGameData and update useCharacterCreation** - `021cd7d` (feat)
2. **Task 2: Replace race text input with race picker and add class filtering to CharacterPanel** - `5c16c45` (feat)
3. **Task 3: Verify complete race selection flow end-to-end** - (human-verify checkpoint — no code commit)

## Files Created/Modified
- `src/composables/useGameData.ts` - Added `const [races] = useTable(tables.race);` and `races` to return object
- `src/composables/useCharacterCreation.ts` - Changed newCharacter shape to `{ name, raceId, className }`, added `selectedRaceRow` and `filteredClassOptions` computeds, updated reducer call with `raceId: BigInt(...)`, updated "all classes" sentinel to check empty string not `'all'`
- `src/components/CharacterPanel.vue` - Replaced race text input with `<select>` dropdown, added race info block, added `displayedClassOptions` computed to filter CLASS_OPTIONS, added `onRaceChange` handler with class-clear logic, updated props interface
- `src/App.vue` - Destructured `races` from useGameData, passed `races` to `useCharacterCreation()` args, destructured `selectedRaceRow` and `filteredClassOptions`, passed all three as props to `<CharacterPanel>`

## Decisions Made
- `filteredClassOptions` returns `null` (not `[]`) when all classes are allowed — the UI `displayedClassOptions` checks `if (!props.filteredClassOptions) return CLASS_OPTIONS` so null is an explicit "show everything" signal
- Class-clear logic runs immediately in `onRaceChange` by inspecting the `races` prop directly, rather than waiting for the reactive `filteredClassOptions` prop to recompute after the emit — this prevents a one-tick window where an invalid class could remain selected
- `selectedRaceRow` and `filteredClassOptions` are computed inside `useCharacterCreation` (not in the component) — the composable owns all race-related business logic; the component receives ready-made values

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. App uses the local SpacetimeDB server that was already running from Plan 01.

## Next Phase Readiness
- Complete race selection system is live: 4 races, class filtering, stat bonuses, raceId reducer integration
- Phase 1 (Races) is fully complete — both backend (01) and frontend (02) plans done
- Phase 2 (Hunger) can begin: no blocking dependencies on Phase 1 beyond what is already complete
- Phase 3 (Renown Foundation) can also begin in parallel — it does not depend on Hunger

---
*Phase: 01-races*
*Completed: 2026-02-12*

## Self-Check: PASSED

Commits verified:
- 021cd7d (Task 1): FOUND
- 5c16c45 (Task 2): FOUND

Files verified:
- src/composables/useGameData.ts: FOUND
- src/composables/useCharacterCreation.ts: FOUND
- src/components/CharacterPanel.vue: FOUND
- src/App.vue: FOUND
