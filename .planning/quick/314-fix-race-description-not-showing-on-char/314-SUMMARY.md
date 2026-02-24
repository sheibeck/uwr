---
phase: quick-314
plan: 01
subsystem: client/character-creation
tags: [bugfix, prop-binding, vue]
dependency_graph:
  requires: []
  provides: [race-info-panel-display]
  affects: [character-creation-flow]
tech_stack:
  added: []
  patterns: [composable-to-template-prop-chain]
key_files:
  modified:
    - src/App.vue
decisions:
  - Fix applied only in App.vue since composable and CharacterPanel were already consistent
metrics:
  duration: 77s
  completed: 2026-02-24T20:41:00Z
---

# Quick Task 314: Fix Race Description Not Showing on Character Creation Screen

Corrected prop name mismatch in App.vue that prevented race info panel from displaying when selecting a race during character creation.

## What Changed

The `useCharacterCreation` composable returns `selectedRace`, but App.vue was destructuring it as `selectedRaceRow` (undefined) and passing it via `:selected-race-row` -- neither matching the composable return key nor the `selectedRace` prop that CharacterPanel.vue expects.

### Fix (src/App.vue only, 2 lines)

1. **Line 889**: `selectedRaceRow` changed to `selectedRace` in destructuring of `useCharacterCreation()` return value
2. **Line 45**: `:selected-race-row="selectedRaceRow"` changed to `:selected-race="selectedRace"` in the CharacterPanel template binding

## Prop Chain (now correct)

```
useCharacterCreation.ts returns selectedRace (line 105)
  -> App.vue destructures selectedRace (line 889)
    -> App.vue passes :selected-race="selectedRace" (line 45)
      -> CharacterPanel.vue receives selectedRace prop (line 131)
        -> v-if="selectedRace" guard (line 31) now truthy when race selected
```

## Deviations from Plan

None -- plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | a3852f2 | Fix prop name mismatch in App.vue |

## Verification

- `npx vue-tsc --noEmit` passes (all errors are pre-existing, none related to this change)
- Prop chain is consistent from composable through App.vue to CharacterPanel.vue

## Self-Check: PASSED
