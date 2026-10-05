---
phase: 45-foundation-frame-and-auth
plan: 07
subsystem: ui
tags: [vue, header, navigation, a11y, notices]
requires:
  - phase: 45-01
    provides: HEADER_SCREENS, ScreenId, screen registry
  - phase: 45-02
    provides: design guards, global .spin class in frame.css
provides:
  - HeaderBar (48px desktop header with place, time of day, tags, screen buttons) and AccountMenu (Log out)
  - tabs.ts (TabId, TABS, screenForTab, tabForScreen), TabBar and LocationRow for mobile
  - NoticeBars (Reconnecting countdown and version reload)
affects: [45-10, 47, 48]
tech-stack:
  added: []
  patterns: [container query on header for label hiding, Esc handled at menu wrapper with stopPropagation, interval-driven countdown from absolute nextRetryAt]
key-files:
  created:
    - src/frame/HeaderBar.vue
    - src/frame/AccountMenu.vue
    - src/frame/HeaderBar.test.ts
    - src/frame/tabs.ts
    - src/frame/TabBar.vue
    - src/frame/LocationRow.vue
    - src/frame/TabBar.test.ts
    - src/frame/NoticeBars.vue
    - src/frame/NoticeBars.test.ts
  modified: []
key-decisions:
  - "Account menu keydown is bound on the wrapper (not the menu) so Esc works from the button too, and stopPropagation keeps it from closing a drawer"
  - "Countdown interval runs only while reconnecting and nextRetryAt is set; derived from the absolute timestamp so it never drifts"
patterns-established:
  - "Frame components take plain props and emit opener elements for focus return"
requirements-completed: [FND-03, FND-05, FND-06]
duration: 12min
completed: 2026-10-05
status: complete
---

# Phase 45 Plan 07: Header, Tab Bar and Notice Bars Summary

**Desktop header with real place/time/tags, six screen toggle buttons and an account menu with Log out, plus the mobile tab bar with location row and the Reconnecting-countdown and version-reload notice bars.**

## Accomplishments
- `HeaderBar.vue`: brand, divider, truncating place label (title carries full text), Day/Night, display-only Level up / New skill tags, screen buttons from `HEADER_SCREENS` with `aria-pressed` and open state, labels hidden below 1100px via container query, `disabled` prop for the combat phase.
- `AccountMenu.vue`: `role="menu"` with name, `Lv N · Race Class` line and one `Log out` item; focus moves to the item on open; Esc (stopPropagation) and outside pointerdown close it and return focus to the button.
- `tabs.ts`, `TabBar.vue` (64px + safe-area, sheet-open surface background), `LocationRow.vue`.
- `NoticeBars.vue`: in-flow 32px bars; Reconnecting first with spinner and `Next try in Ns`, then the version bar with Reload.

## Task Commits
1. Task 1 RED: ecf0cb5f; GREEN: 16249daa
2. Task 2 RED: 922dff4c; GREEN: e1c29bd1
3. Task 3 RED: cecace9c; GREEN: 5a8003cf

## Verification
- `pnpm vitest run src/frame src/styles`: 155 tests pass; `pnpm exec vue-tsc -b` exits 0.
- `pnpm vitest run src --maxWorkers=1`: 3435 pass, 2 fail, both in baseline `spacetimedb/src/helpers/measurement.results.test.ts` (not touched).
- 45-02 guards pass over the new files.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None. Server strings are rendered by text interpolation only (T-45-08), no v-html.

## Self-Check: PASSED
