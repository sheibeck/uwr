---
phase: 45-foundation-frame-and-auth
plan: 05
subsystem: frame
tags: [vue, a11y, focus-management, drawer, sheet]
requires: ["45-01"]
provides:
  - "useScreens: single active-screen state with opener focus return"
  - "useBreakpoint: 900px desktop/mobile switch from matchMedia"
  - "focusTrap: FOCUSABLE_SELECTOR, focusableWithin, trapTabKey"
  - "Drawer.vue and Sheet.vue dialog shells; MoreSheet.vue"
affects: [45-10]
tech-stack:
  added: []
  patterns: ["Document-level Esc listener ignoring defaultPrevented events", "Tab-wrap trap without inert or pointer blocking"]
key-files:
  created:
    - src/frame/useBreakpoint.ts
    - src/frame/useScreens.ts
    - src/frame/focusTrap.ts
    - src/frame/useScreens.test.ts
    - src/frame/Drawer.vue
    - src/frame/Drawer.test.ts
    - src/frame/Sheet.vue
    - src/frame/MoreSheet.vue
    - src/frame/Sheet.test.ts
  modified: []
key-decisions:
  - "focusableWithin also drops tabindex=-1 on buttons (the selector alone matches button:not([disabled]))"
  - "useBreakpoint falls back to a one-time innerWidth check when matchMedia is missing"
  - "Static style assertions read the .vue source via process.cwd() because happy-dom replaces URL and breaks import.meta.url file URLs"
requirements-completed: [FND-04, FND-05]
duration: 15min
completed: 2026-10-05
status: complete
---

# Phase 45 Plan 05: Drawer, Sheet and screen state Summary

Single-screen state machine with opener focus return, a 900px breakpoint composable, a Tab-wrap trap, and the Drawer, Sheet and More sheet shells (role=dialog, Esc, close button, focus to close button on open).

## Tasks

| Task | Name | Commits |
|------|------|---------|
| 1 | useBreakpoint, useScreens, focusTrap | RED 8962730c, GREEN c8945e9e |
| 2 | Drawer shell | RED 7ab93cb0, GREEN c90b00ed |
| 3 | Sheet and MoreSheet | RED 6e4bc3a9, GREEN 52971026 |

## Verification

- `pnpm vitest run src/frame src/styles`: 91 tests pass (frame: useScreens 17, Drawer 8, Sheet 8).
- `pnpm exec vue-tsc -b` exits 0.
- `pnpm vitest run src --maxWorkers=1`: only the baseline `spacetimedb/src/helpers/measurement.results.test.ts` fails; the 45-02 design-contract and colour guards scan the new files and pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] focusableWithin did not skip tabindex=-1 buttons**
- **Found during:** Task 1 GREEN
- **Issue:** `button:not([disabled])` matches a button with `tabindex="-1"`, so the trap would have included it.
- **Fix:** added an explicit `tabindex !== '-1'` filter in `focusableWithin`.
- **Files modified:** src/frame/focusTrap.ts
- **Commit:** c8945e9e

**2. [Rule 3 - Blocking] import.meta.url unusable in happy-dom test**
- **Found during:** Task 2 GREEN
- **Issue:** `new URL('./Drawer.vue', import.meta.url)` throws "URL must be of scheme file" under happy-dom.
- **Fix:** resolve the source path from `process.cwd()` in the test.
- **Files modified:** src/frame/Drawer.test.ts
- **Commit:** c90b00ed

## Known Stubs

None.

## Threat Flags

None. T-45-08 (no v-html, text interpolation only) and T-45-20 (trap acts only on Tab inside the dialog, Esc and close always dismiss, no inert) are satisfied.

## Self-Check: PASSED

All nine files exist and all six task commits are present in git log.
