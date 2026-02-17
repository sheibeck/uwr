---
phase: quick-145
plan: 01
subsystem: client-ui
tags: [command-bar, autocomplete, /who, /createitem, useCommands]
dependency_graph:
  requires: []
  provides: [/createitem autocomplete, /who command handler]
  affects: [src/components/CommandBar.vue, src/composables/useCommands.ts, src/App.vue]
tech_stack:
  added: []
  patterns: [optional Ref params pattern, addLocalEvent output pattern]
key_files:
  created: []
  modified:
    - src/components/CommandBar.vue
    - src/composables/useCommands.ts
    - src/App.vue
decisions:
  - /who reads players table activeCharacterId to determine who is online, then joins to characters and locations for display
  - Players/characters/locations passed as optional Refs to useCommands matching existing arg pattern
metrics:
  duration: 3min
  completed: 2026-02-17
---

# Phase quick-145 Plan 01: Add /createitem autocomplete and /who command Summary

Added /createitem and /who to the CommandBar autocomplete list and implemented the /who command handler in useCommands to display a formatted list of online characters in the Log panel.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add /createitem and /who to autocomplete list | d2fc34e | src/components/CommandBar.vue |
| 2 | Implement /who command with character listing | 0ee0990 | src/composables/useCommands.ts, src/App.vue |

## What Was Built

### Task 1: Autocomplete entries
Two new entries added to the `commands` array in `CommandBar.vue`:
- `{ value: '/createitem', hint: 'Create test item by quality tier' }` — after /spawncorpse
- `{ value: '/who', hint: 'List all online characters' }` — after /resetwindows

Typing `/cr` now shows `/createitem` and typing `/wh` shows both `/who` and `/w` (whisper).

### Task 2: /who command handler
`useCommands.ts` extended with three optional parameters:
- `players?: Ref<PlayerRow[]>` — source of truth for active character IDs
- `characters?: Ref<CharacterRow[]>` — all character records
- `locations?: Ref<LocationRow[]>` — for name lookups

The `/who` handler logic:
1. Collects all `activeCharacterId` values from the players table
2. Filters characters to only those with matching IDs
3. Sorts alphabetically by name
4. Looks up location name from the locations table (fallback: 'Unknown')
5. Calls `addLocalEvent('command', ...)` with formatted output:
   - "Online characters (N):" header with one line per character: `  Name — Level X Class — LocationName`
   - Empty state: "No characters are currently online."

App.vue wires `players`, `characters`, and `locations` from `useGameData()` into `useCommands()`.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `src/components/CommandBar.vue` contains `/createitem` and `/who` entries
- [x] `src/composables/useCommands.ts` contains `/who` handler with `addLocalEvent` call
- [x] `src/App.vue` passes `players`, `characters`, `locations` to `useCommands`
- [x] Commits d2fc34e and 0ee0990 exist
- [x] Pre-existing TypeScript errors confirmed unchanged (no new errors introduced)

## Self-Check: PASSED
