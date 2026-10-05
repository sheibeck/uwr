---
phase: 45-foundation-frame-and-auth
plan: 10
subsystem: ui
tags: [vue, layout, responsive, drawer, sheet, a11y]
requires:
  - phase: 45-05
    provides: useScreens, useBreakpoint, Drawer, Sheet, MoreSheet
  - phase: 45-06
    provides: VitalsRail, VitalsStrip, ContextRail, FeedShell
  - phase: 45-07
    provides: HeaderBar, TabBar, LocationRow, NoticeBars, tabs
provides:
  - "AppFrame.vue: desktop and mobile frame composition with one shared screen state (props view/reconnecting/nextRetryAt/versionPrompt; emits logout/reload)"
  - "Layout, drawer/sheet integration and static frame-contract tests"
affects: [45-11]
tech-stack:
  added: []
  patterns: [controllable matchMedia fake via vi.stubGlobal, keyed Drawer/Sheet to remount focus on screen swap, v-show to keep feed mounted under a sheet]
key-files:
  created:
    - src/frame/AppFrame.vue
    - src/frame/AppFrame.layout.test.ts
    - src/frame/AppFrame.screens.test.ts
    - src/frame/frameContract.test.ts
  modified: []
key-decisions:
  - "Mobile feed and location row are hidden with v-show (not v-if) so the feed stays mounted and keeps its scroll for Phase 47"
  - "Drawer/Sheet are keyed by screen id so a swap remounts and moves focus to the new close button"
  - "matchMedia fake and FrameView fixture are duplicated in each test file so production-file guards never scan test helpers"
patterns-established:
  - "Frame root is 100dvh/overflow hidden; .frame-body is position: relative and hosts the absolutely positioned drawer so notice bars push it down"
requirements-completed: [FND-03, FND-04, FND-05]
duration: 10min
completed: 2026-10-05
status: complete
---

# Phase 45 Plan 10: AppFrame composition Summary

**AppFrame composes the header, notice bars, vitals rail, feed, context rail and drawer on desktop, and the vitals strip, location row, notice bars, feed, sheet/More sheet and tab bar on mobile, switched at 900px with one shared screen state; proven by 9 layout tests, 19 drawer/sheet integration tests and 15 static contract checks.**

## Accomplishments
- `AppFrame.vue`: `useBreakpoint()` picks the layout, `useScreens()` holds the single active screen, `watch(isDesktop, syncLayout)` drops the More sheet on desktop; an open screen survives crossing the breakpoint (drawer to sheet and back).
- Mobile with a sheet open: strip goes compact, feed and location row hidden, tab bar gets `sheet-open`; Story closes any sheet; tabs map via `screenForTab` / `tabForScreen`.
- Notice bars in flow under the header (desktop) or under strip and location row (mobile); `reload` and `logout` re-emitted.
- Tests cover all six header drawers (title, empty line, aria-pressed), one-at-a-time, toggle close, Esc and close-button focus return, header and rail staying present, Tab wrap, account-menu Esc not closing the drawer, mobile Map/Bag/Party/Story/More, Vendor via More with focus return to the More tab, plus static dimensions (252/288/48/760/64+safe-area/20px radius/32px/100dvh), the 900px query pair, the single 1099px container query, body scrolling and reduced-motion rules.

## Task Commits
1. Task 1 RED: 5ef41a73 (layout tests); GREEN: 5164b7b1 (AppFrame.vue)
2. Task 2: 4d113a51 (screens integration + frameContract tests)

## Verification
- `pnpm vitest run src/frame src/styles`: 198 tests pass; `pnpm exec vue-tsc -b` exits 0.
- `pnpm vitest run src --maxWorkers=1`: 3554 pass, 2 fail, both in baseline `spacetimedb/src/helpers/measurement.results.test.ts` (not touched).

## Deviations from Plan

None - plan executed exactly as written.

TDD note: Task 1 followed RED (test commit, fails at import with AppFrame.vue absent) then GREEN. Task 2 tests assert behavior of already-built components and the Task 1 frame, so they passed on first run; there was no separate RED for them.

## Known Stubs

None. Screen bodies render the 45-01 empty-state shells and the rails render their documented empty lines (later phases fill them); AppFrame itself is fully wired to its props.

## Threat Flags

None. T-45-08: AppFrame uses only child components with text interpolation and no v-html (45-02 guard scans it). T-45-20: Esc and close button dismissal verified end to end; header and rail remain pointer-interactive.

## Self-Check: PASSED

All four files exist; commits 5ef41a73, 5164b7b1 and 4d113a51 are in git log.
