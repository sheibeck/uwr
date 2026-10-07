---
phase: 51-ledger-screens-world-and-people
plan: 10
subsystem: ui
tags: [vue, rails, travel-panel, exits, mobile, location-line, exit-chips, client]
status: complete

requires:
  - phase: 51-ledger-screens-world-and-people
    provides: "51-05 travelChecks; 51-06 ConsoleApi.look(); 51-07 MAP_KEY map hub; 51-02 placeDanger, terrainOf, travelTimer; 51-08/09 Map (scoped band classes)"
provides:
  - "src/rails/exits.ts: ExitNote, ExitButton, ExitRow, ExitLocation, ExitRegion, ExitRowsInput, exitRows(), dangerClass(), dangerText(), exitLabel()"
  - "src/rails/useExits.ts: useExits() (rows, ready, here, timer, beginTravel) and usePlaceView(): one source for the rail Here card, the mobile chips and the mobile location line"
  - "src/rails/HereCard.vue: the Console 12a exits panel (kicker, timer chip, title with Examine eye, danger sub-line, expandable exit rows, Travel/Cross buttons)"
  - "src/rails/ExitChips.vue: the mobile exit chip strip and open card"
  - "src/frame/LocationRow.vue: mobile location line with terrain, level band and timer; time of day removed (prop dropped)"
  - "AppFrame mounts ExitChips under LocationRow on mobile"
affects: [51-11]

tech-stack:
  added: []
  patterns:
    - "Rail and mobile travel surfaces share one composable (useExits) over travelChecks; the components keep the console calls (consoleApi.travel, examine, look) so each file shows its own wiring"
    - "Band colours via scoped lv-* classes mapped to tokens (dangerClass returns the class name), same approach as the Map"
    - "A row button only expands; the inner Travel/Cross button is the only thing that travels"

key-files:
  created:
    - src/rails/exits.ts
    - src/rails/exits.test.ts
    - src/rails/useExits.ts
    - src/rails/ExitChips.vue
    - src/rails/ExitChips.test.ts
    - src/rails/HereCard.test.ts
    - src/frame/LocationRow.test.ts
  modified:
    - src/rails/HereCard.vue
    - src/frame/LocationRow.vue
    - src/frame/AppFrame.vue
    - src/frame/AppFrame.layout.test.ts
    - src/frame/AppFrame.populated.test.ts
    - src/frame/AppFrame.screens.test.ts
    - src/frame/ContextRail.test.ts
    - src/frame/TabBar.test.ts
    - src/rails/ContextContent.test.ts

key-decisions:
  - "The exit rows (and the empty line) render only once the map hub is ready (visited, connections, cooldowns applied); the kicker, title, eye and sub-line render without it"
  - "The neighbour set still comes from routesFrom(game.connections, ...) as in 47; heard-of comes from map.known.heardOf; costs, blocks and times from travelChecks over game (party, effects, gathers) and map (cooldowns, nowMicros)"
  - "A local pending guard (2 s, cleared on any character place change) makes the Travel and Cross buttons inert after a click; consoleApi.travel itself returns void"
  - "Locked right-hand text and the Cross button's clock use your own timer only; a follower's timer blocks the button and note ('Region travel in {longest}') but does not lock the row"

patterns-established:
  - "exitLabel(row) is the accessible name of a row or chip: place (region), level and band, and the minute sentence for a locked crossing"
  - "Visible clocks are aria-hidden next to a .sr-only minute sentence; on the mobile card the whole visible blocked sentence is aria-hidden with a whole-sentence sr twin"

requirements-completed: [LDG-05]

duration: 75min
completed: 2026-10-07
---

# Phase 51 Plan 10: Rail travel panel Summary

**The context rail's Here card is now the Console 12a exits panel: one expandable row per route out with terrain ring, danger text, region crossing mark, a note and an inner Travel or Cross button (travel only there, through the console), a region timer chip and Examine eyes; on mobile the Story location line shows terrain, level and the timer, and a sideways exit chip strip with an open card travels without opening the Map. All costs, blocks and times come from travelChecks, placeDanger and the server's cooldown row.**

## Performance

- **Duration:** about 75 min
- **Tasks:** 3 (all TDD, RED commit then GREEN commit each)
- **Files:** 7 created, 9 modified

## Accomplishments

- **exits.ts (pure):** `exitRows` maps each route to ring colour (placeDanger), terrain (terrainOf), crossing and region name, right text and colour, locked clock (your own timer on a crossing), note (neutral / accent / wait / bad) and button state. Notes follow the UI-SPEC copy exactly, including ' · {n} following', 'Finish gathering first.', 'Not enough stamina.', '{name} is short on stamina.' and 'Region travel in ' + clock with a minute sentence. Cost text is the shared travelChecks text ('5 stamina', '5 stamina each' for a party).
- **HereCard:** kicker with the timer chip only while the timer runs; title (tabindex -1, ellipsis, `title`) with the Examine eye calling `consoleApi.look()`; sub-line `{Terrain} · Lv a–b · {band}` / `Safe` / `Danger unknown`; `ul.exits` with `li.exit`, `button.exit-row` (aria-expanded, aria-controls on the open region, aria-label from `exitLabel`), a sibling `Examine {place}` eye (`consoleApi.examine`), and the open region with the note and `.btn-primary` Travel / Cross (`consoleApi.travel`). Blocked buttons are aria-disabled and described by the note; offline everything but the row toggle is aria-disabled and inert. One row open at a time; a character place change closes every row and moves focus to the title only if it was inside the card.
- **LocationRow:** pin, place, `· {Terrain} ·`, level in its band colour, right-aligned hourglass and clock plus `.sr-only` twin while the timer runs; the `timeOfDay` prop is gone (declared props: `locationName` only).
- **ExitChips:** `ul.strip` (overflow-x auto) of 44px chips (ring, name with door mark on crossings, `Lv a–b · {band}` / `Safe` / lock and clock), one open card at a time with name, terrain line, status line (crossing, cost, follower count, timer or other block) and a full-width Travel to / Cross into / `Region travel in {m:ss}` button. Root is always an element (renders empty with no exits), so AppFrame's `v-show` is valid.
- **AppFrame:** `<ExitChips v-if="!combatActive" v-show="!sheetOpen && !keyboardOpen" />` right after LocationRow; LocationRow no longer receives time of day (HeaderBar keeps it).

## Task Commits

| Task | RED | GREEN |
|------|-----|-------|
| 1 Exits model | de91c2f9 | 402e98dc |
| 2 Here card as the exits panel | fad99c95 | 5ecf696d |
| 3 Mobile location line and chip strip | 46d858b0 | f3a11f15 |

RED runs: exits.test.ts failed to import `./exits` (no module); HereCard.test.ts 15 failed, 5 passed against the old card; LocationRow/ExitChips/layout tests 11 failed (ExitChips file did not import) before the components existed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] A shared composable, src/rails/useExits.ts (not in the plan's file list)**
- **Found during:** Task 2
- **Issue:** HereCard, ExitChips and LocationRow all need the same game-plus-map to travelChecks plumbing and the same here-place view; duplicating it would let the three surfaces drift.
- **Fix:** `useExits()` (rows, ready, here, timer, beginTravel pending guard) and `usePlaceView()`. The components keep the console calls themselves so `consoleApi.travel(`, `consoleApi.look()` and the eyes stay visible in HereCard.vue (acceptance greps pass).
- **Commit:** 5ecf696d

**2. [Rule 3 - Blocking] Existing tests that exercised the old route rows or the old location line**
- **Found during:** Task 2 and 3
- **Issue:** `src/rails/ContextContent.test.ts` (route rows, offline sweep, the first-button lookup in the Pull test, the 'routesFrom' source check) and `src/frame/TabBar.test.ts` (a LocationRow describe with time of day) were not in the plan's list but pin the replaced behaviour.
- **Fix:** Moved them to the new rows (expand then Travel; a mounted ready MAP_KEY; the row toggle stays operable offline while the inner button and eyes are aria-disabled; the Pull test selects by label); the LocationRow cases moved to LocationRow.test.ts. Nothing was dropped without a replacement.
- **Commits:** 5ecf696d, f3a11f15

**3. [Rule 1 - Bug] Negative margin on the exits list**
- **Issue:** The UI-SPEC card anatomy gives `ul.exits` `margin: 0 -4px`; the design contract test bans negative spacing.
- **Fix:** `margin: 0`; the rows keep their own 4px 8px padding, so the visual difference is a 4px inset on each side.
- **Commit:** 5ecf696d

**4. [Rule 2 - Missing robustness] Tolerant terrain at the boundary**
- **Issue:** Many existing test fixtures (and any partial row) omit `terrainType`; `terrainOf` throws on undefined and would blank the whole rail.
- **Fix:** `terrainOf(x ?? '')` in exits.ts and useExits.ts only. Production rows always have the field.
- **Commit:** 5ecf696d

**5. [Plan extension] ExitRow gains `costText`; exits.ts gains `dangerClass`, `dangerText`, `exitLabel`**
- The mobile card's status line needs the cost for same-region exits, and the three components share the class, text and accessible-name helpers. Additive; the plan's interface fields are unchanged.
- **Commit:** f3a11f15

**6. [Plan wording] Mobile card for stamina and gathering blocks**
- The UI-SPEC lists only the timer for the mobile blocked line. For a gathering or stamina block the card status shows the note text in the red tone, and the button stays disabled with its normal label (described by that line).

No server changes, no publish, no bindings regeneration. The console path still echoes `go to {place}` as it does today; no client-made arrival or trip lines were added (the arrival lines are the server's).

## Verification

- Touched suites: `src/rails src/frame src/styles` 720 tests pass.
- `npx vue-tsc -b` exits 0.
- Full `npx vitest run` from the repo root: 9674 passed, 2 failed, 3 failed files, all baseline (scripts/llm/call_log_report.test.mjs, scripts/llm/proof_rules.test.mjs, spacetimedb/src/helpers/measurement.results.test.ts).
- Acceptance greps: `export function exitRows` 1, `starts the region travel timer` 1, `travelChecks|TravelChecks` in exits.ts 6, `aria-expanded` in HereCard 1, `aria-controls` 1, `consoleApi.travel(` 1, `consoleApi.look()` 1, `Region travel timer` 1, `ExitChips` in AppFrame 2, `overflow-x: auto` in ExitChips 1, `min-height: 44px` in ExitChips 2, PhHourglassMedium in LocationRow present.
- Prohibitions: HereCard.test.ts asserts a row click never calls consoleApi.travel; source checks ban COOLDOWN, game.feed and Date.now in HereCard and ExitChips; the exits tests read every time from the cooldown rows passed in.

## Backstop items (visual, not automated)

For the milestone-end check: R4 overflow at 390 with 8 exits and long names (horizontal scroll, 44px chips, chip line 1 ellipsis at 144px); the desktop rail with a crossing row's name plus region suffix at 256px; the sub-line and kicker/timer chip at long names.

## Known Stubs

None. Player stamina for followers uses `game.knownCharacters` rows (known party members at your place), as in 51-05.

## Threat Flags

None. All place, region and terrain names and descriptions render as text nodes or bound attributes (T-51-39: HereCard.test.ts puts an img onerror payload in a description and asserts no img and the payload as the title attribute; ExitChips and LocationRow have the same check). The only travel path is consoleApi.travel, whose reducer re-checks everything (T-51-40). Costs and times come from travelChecks and the cooldown row only (T-51-41).

## For later Phase 51 plans (51-11)

- `useExits()` / `usePlaceView()` in `src/rails/useExits.ts`; `exitRows`, `exitLabel`, `dangerClass`, `dangerText` in `src/rails/exits.ts`.
- The mobile Map tab still renders ContextContent (the Here card with the new rows) until 51-11 replaces the MapScreen mobile branch; that sheet's Travel button goes through consoleApi.travel and closes the sheet.
- LocationRow no longer takes `timeOfDay`; if the mobile Map dock wants the same line, reuse `usePlaceView()` and the `lv-*` classes.
- HereCard exit rows are `button.exit-row`; the tests of other screens that counted `button.route-row` no longer apply.

## Self-Check: PASSED

All created files exist (exits.ts, exits.test.ts, useExits.ts, ExitChips.vue, ExitChips.test.ts, HereCard.test.ts, LocationRow.test.ts); commits de91c2f9, 402e98dc, fad99c95, 5ecf696d, 46d858b0 and f3a11f15 are in the log.
