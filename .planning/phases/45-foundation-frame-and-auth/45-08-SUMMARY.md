---
phase: 45-foundation-frame-and-auth
plan: 08
subsystem: ui
tags: [vue, splash, sign-in, character-picker]
requires:
  - phase: 45-02
    provides: design guards, global .spin and .session-ground classes
  - phase: 45-04
    provides: SplashState, accountLine, avatarInitial
provides:
  - SplashScreen (16:9 key-art logo, seven sign-in states, Enter handler)
  - PreFrameHeader (48px bar with title and Log out)
  - CharacterPicker (rows emit select with bigint id, pending spinner, failure alert)
  - NoCharactersNote (note with Log out)
affects: [45-11, 49]
tech-stack:
  added: []
  patterns: [static SFC style rule pinned via sfcStyleBlocks + parseDecls, BASE_URL-relative asset path]
key-files:
  created:
    - src/session/SplashScreen.vue
    - src/session/SplashScreen.test.ts
    - src/session/PreFrameHeader.vue
    - src/session/CharacterPicker.vue
    - src/session/NoCharactersNote.vue
    - src/session/CharacterPicker.test.ts
  modified: []
key-decisions:
  - "Splash Enter handler is gated on the button being shown and enabled, not on connection state (PKCE redirect needs no socket)"
  - "Source files for static tests are resolved from process.cwd() because new URL(import.meta.url) throws under happy-dom"
  - "Status area is always rendered (aria-live polite, min-height 24px) so the layout never shifts between states"
patterns-established:
  - "Pre-frame views share PreFrameHeader and the global .session-ground"
requirements-completed: [FND-07, FND-06]
duration: 10min
completed: 2026-10-05
status: complete
---

# Phase 45 Plan 08: Splash, Character Picker and No-Characters Note Summary

Full-viewport session views: a splash with the undistorted 16:9 key-art logo and seven states, a character picker with pending/failed handling, and a no-characters note, all sharing a 48px pre-frame header.

## Tasks

| Task | Name | Commits |
|------|------|---------|
| 1 | Splash / sign-in screen with the 16:9 logo | RED 59776230, GREEN 8c89fe96 |
| 2 | Pre-frame header, character picker, no-characters note | RED b5f5602c, GREEN f4e3dedc |

## What was built

- SplashScreen.vue: logo from `${import.meta.env.BASE_URL}assets/logo.png` with width/height 1672x941, `.splash-logo` rule pinned statically (min(960px, 100%), calc(100dvh - 176px), 16 / 9, contain, height auto, no image-rendering). State table implemented for all seven states; error lines use role="alert", status uses an always-present aria-live region with a spinner.
- PreFrameHeader.vue: brand and divider hidden below 900px, title, ghost Log out.
- CharacterPicker.vue: rows in the given order with aria-label "Play as {name}", ellipsis name with title, accountLine, caret or spinner on the pending row, all rows disabled while pending, alert above the list on failure, list scrolls with max-height calc(100dvh - 160px).
- NoCharactersNote.vue: kicker, title, body and secondary Log out per spec.
- Tests: 26 new tests (SplashScreen.test.ts, CharacterPicker.test.ts) covering every behavior bullet including the PNG IHDR check and an XSS-as-text check on names.

## Verification

- `pnpm vitest run src/session src/styles`: 8 files, 126 tests pass
- `pnpm exec vue-tsc -b`: exit 0

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None. T-45-08 mitigated: names rendered by text interpolation, aria-label via bound attribute, test asserts markup in a name is not parsed.

## Self-Check: PASSED
