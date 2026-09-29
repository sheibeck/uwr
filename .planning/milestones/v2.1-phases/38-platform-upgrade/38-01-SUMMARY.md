---
phase: 38-platform-upgrade
plan: 01
subsystem: tooling
tags: [vue-tsc, vitest, spacetimedb-client, connection-logging, type-cleanup]
requires: []
provides:
  - Green tests on the current toolchain (root 513 tests, spacetimedb/ 478 tests)
  - Root `test` script (`vitest run`)
  - src/connectionLogging.ts (logDisconnect / logConnectError) with tests
  - Single exported HotbarDisplaySlot type
  - vue-tsc clean outside src/App.vue
affects: [38-02, 38-03]
tech-stack:
  added: []
  patterns:
    - "Connection handlers as contextually typed inline lambdas delegating to context-free helpers (avoids TS2589 with SDK 2.10.1 bindings on TS 5.6)"
key-files:
  created:
    - src/connectionLogging.ts
    - src/connectionLogging.test.ts
  modified:
    - spacetimedb/src/reducers/intent.test.ts
    - package.json
    - src/main.ts
    - src/composables/useHotbar.ts
    - src/components/NarrativeHotbar.vue
    - src/components/NarrativeConsole.vue
    - src/components/CharacterInfoPanel.vue
    - src/composables/useCombat.ts
    - src/components/ActionBar.vue
    - src/components/AppHeader.vue
    - src/components/FriendsPanel.vue
    - src/components/GroupPanel.vue
    - src/components/NarrativeMessage.vue
    - src/components/WorldEventPanel.vue
    - src/composables/useCommands.ts
    - src/composables/usePanelManager.ts
    - src/composables/useSkillChoice.ts
    - src/composables/useLlmProxy.ts
decisions:
  - "buildLookOutput tests were wrong, not look.ts: expectations updated to the color-tagged name"
  - "Websocket errors on an established connection (2.10 routes them to onDisconnect) log as console.warn including the error"
  - "CharacterInfoPanel.vue (orphaned) migrated to the key/level/resource ability shape rather than deleted"
metrics:
  tasks: 3
  files_changed: 20
  vue-tsc-errors-total: "137 -> 106 (all remaining in src/App.vue, owned by 38-02)"
  vue-tsc-errors-outside-app-vue: "31 -> 0"
completed: 2026-09-29
status: complete
---

# Phase 38 Plan 01: Green Baseline Outside App.vue and 2.10 Connection Logging Summary

Zero vue-tsc errors and zero failing tests outside `src/App.vue` on the current toolchain, plus tested `onDisconnect`/`onConnectError` logging that is safe for the upcoming SDK 2.10.1 bump.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | Green known-red tests, root test script, connection logging helpers | 7dc1799c |
| 2 | Unify HotbarDisplaySlot; fix NarrativeConsole, CharacterInfoPanel, useCombat types | d1b35923 |
| 3 | Remove unused declarations in remaining 10 non-App files | 5244c7c1 |

## Results

- vue-tsc (`node_modules/.bin/vue-tsc --noEmit -p tsconfig.json`): 137 errors total before, 106 after. Outside `src/App.vue`: 31 before, 0 after. The 106 remaining are all in `src/App.vue` (plan 38-02).
- Root Vitest: 19 files, 513 tests pass (includes the 4 new connectionLogging tests). `spacetimedb/` Vitest: 16 files, 478 tests pass. The 2 former `buildLookOutput` failures are fixed.
- `vite build` succeeds. `tsconfig.json` and `spacetimedb/src/helpers/look.ts` are untouched; `noUnusedLocals`/`noUnusedParameters` remain on.
- No dependency was installed or bumped, and no `pnpm install`/`npm install` was run. Only the `"test": "vitest run"` script was added to `package.json`.

## Orphaned component cluster (follow-up)

`CharacterInfoPanel.vue` has no importers (`App.vue` only carries comments saying it was removed in quick-383). It renders `InventoryPanel.vue`, `StatsPanel.vue` and `RacialProfilePanel.vue`. This cluster is a candidate for a follow-up deletion. It was not deleted in this phase. `CharacterInfoPanel.vue` was migrated to the new ability shape (`key`, `level`, `resource`), and its `add-ability-to-hotbar` emit now carries `abilityKey: string`. Because nothing imports it, this changes no runtime behavior.

## Deviations from Plan

None affecting behavior. Two small notes:

- Several files use CRLF line endings, so edits were applied with a CRLF-preserving script. Diffs are minimal.
- In `useLlmProxy.ts` the two comment lines directly describing the deleted `config` lookup were removed along with it; the proxy-secret comment was kept.

## Known Stubs

None.

## Threat Flags

None. No new network, auth, or file-access surface. `connectionLogging.ts` logs only the SDK's Error object, same exposure as before.

## Self-Check: PASSED

- src/connectionLogging.ts and src/connectionLogging.test.ts exist.
- Commits 7dc1799c, d1b35923 and 5244c7c1 exist in git log.
