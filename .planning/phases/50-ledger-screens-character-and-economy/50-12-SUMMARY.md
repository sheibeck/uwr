---
phase: 50-ledger-screens-character-and-economy
plan: 12
subsystem: client-shell
tags: [vue, session, frame, wiring]

requires:
  - phase: 50-10
    provides: "createLedgerData, ledgerQueries, LEDGER_KEY, createInertLedger"
provides:
  - "Session.ledger: the session-owned ledger hub, reset on logout, disposed with the session"
  - "App provides LEDGER_KEY (inert fallback)"
  - "FrameControls.screenArgs and openScreen(id, args?) for opening the vendor for an NPC"
  - "ScreenDef.meta rendered in the Drawer and Sheet #meta slot"
affects: [50-18 Nearby Trade (opens the vendor through FRAME_KEY), 50-15 and later screens (header meta), 50-23 screen registration]

tech-stack:
  added: []
  patterns:
    - "Session hub factory on SessionDeps with an inert default; frame state cleared by a sync watch on the active screen"

key-files:
  created: []
  modified:
    - src/session/useSession.ts
    - src/session/useSession.test.ts
    - src/App.vue
    - src/App.test.ts
    - src/game/context.ts
    - src/frame/AppFrame.vue
    - src/screens/screens.ts
    - src/frame/frameControls.test.ts
    - src/console/useConsole.test.ts

key-decisions:
  - "screenArgs is stored only for the vendor screen and only when the open actually landed on it (a combat-locked open leaves null)"
  - "openScreen('vendor', args) while the vendor is already open replaces the arguments in place (the active screen does not change, so the shell stays mounted and the screen reads screenArgs reactively)"

requirements-completed: [LDG-01, LDG-03, LDG-08, LDG-10]

status: complete
duration: 25min
completed: 2026-10-06
---

# Phase 50 Plan 12: Session ledger hub and frame screen arguments Summary

The app now owns a live ledger hub for the active character (built with the real bindings, reset on logout, disposed with the session, provided under `LEDGER_KEY`), and the frame can open the vendor for a specific NPC and render a per-screen header meta in both shells.

## Final FrameControls signature (src/game/context.ts)

```ts
export interface ScreenArgs { npcId?: bigint; npcName?: string }
export interface FrameControls {
  readonly isDesktop: Readonly<Ref<boolean>>;
  readonly activeScreen: Readonly<Ref<ActiveScreen>>;
  readonly screenArgs: Readonly<Ref<ScreenArgs | null>>;
  openScreen(id: ScreenId | 'encounter', args?: ScreenArgs): void;
  closeScreen(): void;
}
```

`createInertFrame()` has `screenArgs` null. Plan 18 opens the vendor from Nearby with `frame.openScreen('vendor', { npcId, npcName })`.

`context.ts` diff hunks (3, nothing else changed): the new `ScreenArgs` interface; the `FrameControls` members (`screenArgs`, the `openScreen` signature); the `createInertFrame` `screenArgs` line. `gameData.ts` and `src/game/queries.ts` are untouched.

## How meta components are rendered

`ScreenDef.meta?: Component` (screens.ts). AppFrame renders `<template v-if="activeDef.meta" #meta><component :is="activeDef.meta" /></template>` inside the desktop `Drawer` and inside the mobile screen `Sheet`; with no meta the slot is not passed (the Drawer keeps its existing empty `.drawer-meta` span, the Sheet renders nothing). The `:key="activeDef.id"` is unchanged. No `screens.ts` entry sets a meta yet (Plan 23).

## Screen arguments behavior (AppFrame)

A `shallowRef` set after `screens.open(...)` (only for the vendor, only when the open landed on the vendor), exposed as a computed. A `flush: 'sync'` watch on `screens.active` clears it whenever the active screen is not the vendor, so close, More, tabs and every other screen drop a stale vendor; close-then-open in the same tick ends on the new arguments.

## Verification

- `pnpm exec vitest run src/session src/App.test.ts src/frame src/screens src/console src/combat --maxWorkers=2`: all passed (48 files, 1028 tests in the frame, screens, console and combat run; session and App run 9 files, 174 tests).
- New tests: 4 in the "ledger hub wiring" session describe, 2 App provide tests, 11 in frameControls.test.ts (8 screenArgs, 3 meta).
- `pnpm exec vue-tsc -b`: exit 0 (the real DbConnection satisfies `LedgerConn`).
- `git diff --stat src/game/gameData.ts src/game/queries.ts`: empty.

## Task commits

1. `c20090c9` session-owned ledger hub provided to the app
2. `94ef2171` FrameControls screen arguments and per-screen header meta

## Deviations from Plan

**1. [Rule 3 - Blocking] `src/console/useConsole.test.ts` gained `screenArgs: ref(null)`**
- **Found during:** Task 2 (vue-tsc)
- **Issue:** its hand-built `FrameControls` literal no longer satisfied the interface after `screenArgs` became required.
- **Fix:** one added line in the test's frame fake. No production change.
- **Commit:** `94ef2171`

**2. [Interpretation] Meta test uses a module mock of `getScreen`**
- The plan allowed a small component test if `screens.ts` could not be stubbed; `vi.mock('../screens/screens')` with a partial override of `getScreen` works cleanly, so the meta rendering is tested through the real AppFrame (desktop drawer and mobile sheet, and the no-meta case).

## Known Stubs

None.

## Threat Flags

None. T-50-40 (logout calls `ledger.reset()`, tested), T-50-41 (arguments cleared synchronously off the vendor, tested) and T-50-42 (additive shell edits, all frame tests green) hold.

## Self-Check: PASSED

- FOUND: the modified files above; commits c20090c9, 94ef2171
