---
phase: 47-console-rails-hotbar-and-input
plan: 12
subsystem: client-integration
tags: [vue, mobile, integration, verification, scrollbars]
requires: ["47-08", "47-09", "47-10", "47-11"]
provides:
  - "MapScreen and SocialScreen sheet bodies carrying the rail content on mobile"
  - "useKeyboardOpen: strip compaction while the software keyboard is open"
  - "Populated frame integration test covering the composer end to end (INP-01, INP-02)"
  - "One shared dark scrollbar rule and a full-width desktop feed (owner try-out)"
affects: [48, 49, 50]
key-files:
  created:
    - src/frame/useKeyboardOpen.ts
    - src/frame/useKeyboardOpen.test.ts
    - src/frame/AppFrame.populated.test.ts
    - src/styles/scrollbars.test.ts
    - .planning/todos/pending/2026-10-05-event-tables-public-read.md
  modified:
    - src/screens/MapScreen.vue
    - src/screens/SocialScreen.vue
    - src/frame/AppFrame.vue
    - src/frame/AppFrame.screens.test.ts
    - src/frame/AppFrame.layout.test.ts
    - src/styles/frame.css
    - src/console/FeedView.vue
    - src/frame/FeedShell.vue
    - src/hotbar/HotbarRow.vue
    - src/console/FeedView.test.ts
    - src/frame/frameContract.test.ts
    - src/frame/railsShell.test.ts
requirements-completed: [CON-03, CON-04, CON-05, INP-01, INP-02]
status: complete
completed: 2026-10-05
---

# Phase 47 Plan 12: Mobile sheets, keyboard compaction, integration test and owner try-out Summary

The mobile Map and Social sheets now carry the full rail content, the strip compacts while the phone keyboard is open, a populated-frame integration test drives the composer end to end, and the owner's try-out is approved with two follow-ups (dark scrollbars, a feed that fills the desktop width), both applied.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | Mobile Map and Social sheet bodies | 70a6a821 |
| 2 | Keyboard-open compaction | 941c03d8 |
| 3 | Populated frame integration test, full gate, server todo | f4b61570 |
| 4 | Owner try-out (checkpoint:human-verify) | approved with two follow-ups, applied in b4a03602 |

- **Task 1:** the Map sheet body is the context rail content in order (Here card with routes, Nearby, Tracking, World event card); the Social sheet body has the Party block at the top and the Phase 45 empty state under it only outside a party. Desktop drawers keep their Phase 45 empty states. Tests cover that party and member chips in the strip open the Social sheet. Rail or sheet actions that send a line, pre-fill the input or start a conversation close the sheet first.
- **Task 2:** on mobile, when the input has focus and the visual viewport is more than 120px shorter than the window, the vitals strip collapses to its compact row and the location row hides; both return on blur.
- **Task 3:** `AppFrame.populated.test.ts` renders the frame at desktop and mobile widths with a populated game (labelled feed lines and keywords, ten hotbar slots, vitals with XP, effects and party, routes, Nearby, tracking, event card) and drives the composer: "Accept my apology" calls `submit_intent`, "invite Bob" calls `invite_to_group` with `targetName: 'Bob'`, "/who" calls `submit_intent` with "who". The event-table exposure is recorded in the pending todo for a server hardening phase (T-47-04b).

## Owner try-out (Task 4)

The owner tried the playable client on 2026-10-05 and replied, verbatim:

> "The only issue is the scrollbar is a little jarring because it's all white on our nice dark interface. Also, on desktop, our main narrative doesn't fill the width. This is OK if it's intentional, but it looks a bit odd to not have it fill the space. Aside from the 2 things ... I approve."

### Follow-up fix 1: dark scrollbars
- One shared rule in `src/styles/frame.css` on `*`: `scrollbar-width: thin; scrollbar-color: var(--color-neutral-700) transparent;`, plus `*::-webkit-scrollbar` (8px wide and high), a transparent track and corner, a thumb of `var(--color-neutral-700)` with a 4px radius and a `var(--color-neutral-600)` hover, for Chromium builds that ignore `scrollbar-color`. It covers the feed log, drawer and sheet bodies, rails, hotbar strip and the page.
- The redundant per-component `scrollbar-width` and `scrollbar-color` in `HotbarRow.vue` `.slot-strip` were removed (the shared rule gives the same look). The surfaces that hide their bar (`.chip-row` and the mobile `.slot-strip`) still use `scrollbar-width: none`; their selectors are more specific than `*`.
- Tokens only, no literal colors, no new custom properties. 8px and 4px are not spacing properties (the spacing guard looks at padding, margin and gap), so no exception was needed.
- New `src/styles/scrollbars.test.ts` (6 tests): the shared rule exists and its colors are only `var(--...)` or `transparent`, the webkit rules and sizes, the thumb token is defined by Nocturne, no component re-colors a scrollbar with a literal, and the hiding surfaces still hide.

### Follow-up fix 2: the desktop feed fills the width
- Removed `max-width: 760px` from `.feed-lines` and `.feed-tail` in `FeedView.vue`, and `max-width: calc(760px + 64px)` (plus the `max-width: none` of the compact variant) from `.composer` in `FeedShell.vue`. The hotbar row sits inside the composer section, so it fills too. Padding is unchanged (`16px 32px` desktop; compact variants unchanged). Mobile is unchanged.
- Appended "## Owner try-out changes (2026-10-05)" to `47-UI-SPEC.md`, superseding the 760px measure from 45-UI-SPEC for the desktop feed.

### Assertions changed (deliberate, owner-requested contract change)
1. `src/frame/frameContract.test.ts`: "the feed line is capped at 760px" is now "the feed lines fill the center column (no max-width measure)": `.feed-lines` width is `100%` and neither `.feed-lines` nor `.feed-tail` declares `max-width`. A new test asserts `.composer` is `width: 100%` with no `max-width`, and `.compact .composer` has none.
2. `src/frame/railsShell.test.ts`: the "bottom-anchors a 760px line" test now expects FeedView not to contain `max-width: 760px` and FeedShell not to contain `max-width`; the `margin-top: auto` and padding assertions are unchanged.
3. `src/console/FeedView.test.ts` ("uses the spec line width ..."): `toContain('max-width: 760px')` became `not.toContain('max-width: 760px')`. The task text did not list this file, but it pinned the same value.
No composer or hotbar max-width pin existed.

## Deviations from Plan

**1. Sheet padding left to Sheet.vue.** The mobile sheet bodies (`MapScreen.vue`, `SocialScreen.vue`) do not add their own padding; `Sheet.vue` owns the body padding. (Deviation from the checkpoint return.)

**2. Keyboard tests use a connected fake game.** The composer input is disabled while offline, so the focus and blur cases in `AppFrame.layout.test.ts` mount with a connected fake game to be able to focus it. (Deviation from the checkpoint return.)

**3. Two `find()` type fixes.** Two `find()` calls needed type fixes for `vue-tsc -b` (type-only, no behavior change). (Deviation from the checkpoint return.)

**4. [Owner follow-up, not a plan deviation] FeedView.test.ts** also pinned the 760px value and was updated with the other two (see above).

**5. Process:** as in earlier 47 plans, implementation and tests were committed together per task. Plan type is `execute`; no TDD gate section applies.

## Gate results (after the owner follow-ups)
- `pnpm exec vitest run --dir src --maxWorkers=2`: 78 files, 1354 tests pass (1347 before: 6 new in scrollbars.test.ts, 1 new composer test in frameContract.test.ts).
- `pnpm exec vue-tsc -b`: exits 0.
- `pnpm build`: passes, "bundle clean: 4 files scanned".
- Design guards (`src/styles`) pass: no literal colors, no ad-hoc custom properties, spacing and sizes on the allowed scales.
- No file under `spacetimedb/` or `src/module_bindings/` changed. Nothing published, no push, no LLM calls, no stash. The owner's SpacetimeDB and the Vite dev server were not touched.

## Threat model
- T-47-04b (public event tables, server, pre-existing): transferred; recorded in `.planning/todos/pending/2026-10-05-event-tables-public-read.md`.
- T-47-08: `pnpm build` runs the bundle check; clean.
- T-47-19: the populated and screens tests assert a sheet closes and the same reducer is called as from the rails.

## Deferred owner verification

The ten try-out steps below were verified by the owner on 2026-10-05, apart from the two follow-ups above (both applied afterward; the owner should glance at them on the running client).

1. Start the local stack with the run-local skill (local SpacetimeDB, module published locally, `pnpm dev` on port 5173) and sign in with an existing character. Never publish to maincloud.
2. Feed (CON-01): the scene from the automatic look is the first line; Keeper narration has the 'The Keeper' label; an NPC reply shows separate narration and 'Name says, "..."' lines; whispers, party chat, quest lines and ripples look distinct. Whispers and party chat appear once (A13, A3) and the event-table subscriptions return rows (research A1).
3. Keywords (CON-02): click an NPC name (chip 'Talking with ...' appears), a place (you travel), a resource node (look at), a player (whisper pre-fill).
4. Input (INP-01, INP-02): 'Who is that over there?', 'Leave him alone', 'End this now', 'Accept my apology' each get a Keeper or intent reply, never a group command. Then 'who', '/who', 'invite <name>', 'renown', 'factions', 'events', 'group'.
5. Keeper working (CON-06): send a line to an NPC; while the progress line shows, send two more lines and see 'Queued'; they release one at a time.
6. Hotbar (CON-05): icons, number keys 1-0 with the input blurred, the cooldown sweep and seconds, switching hotbars.
7. Vitals and rails (CON-03, CON-04): XP bar, effect chips, party cards with health and Invite pre-fill, route level tags or Safe, Nearby actions, tracked quest progress, world event objective progress.
8. Width 900px: the hotbar strip scrolls sideways; keywords wrap in the narrow feed.
9. Phone at 390x844: Map tab shows routes, Nearby, Tracking and the event; Party tab shows the party; strip chips open Social; the strip compacts with the keyboard open (see remaining items); iOS zoom on the 14px input (A9, see remaining items).
10. Phase 46 deferred item 5: read the new Keeper lines in the console.

**Remaining items for the end-of-milestone pass:**
- Keyboard-open compaction on a real phone (the owner's try-out could not exercise a real software keyboard).
- iOS 14px input zoom (A9): decide between the 16px mobile-input exception and accepting the zoom.
- Nearby objects not listed (A7): the data source is unresolved, so the Nearby list does not show objects.
- Route level rule confirmation: confirm the per-location level tags or Safe rule against the intended design.
- Effect time shown only in combat: confirm that hiding the time on effect chips outside combat is the wanted behavior.
- After the follow-ups: a quick look at the dark scrollbars and the full-width desktop feed on the running client.

## Known Stubs
None.

## Self-Check: PASSED
- Commits 70a6a821, 941c03d8, f4b61570 and b4a03602 exist in `git log`.
- Created files exist: `src/styles/scrollbars.test.ts`, `src/frame/useKeyboardOpen.ts`, `src/frame/AppFrame.populated.test.ts`, the pending todo.
