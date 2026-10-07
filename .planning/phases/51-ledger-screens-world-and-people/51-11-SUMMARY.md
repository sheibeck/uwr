---
phase: 51-ledger-screens-world-and-people
plan: 11
subsystem: ui
tags: [vue, map, mobile, sheet, dock, accessibility, phase-gate, docs, client]
status: complete

requires:
  - phase: 51-ledger-screens-world-and-people
    provides: "51-09 useDestination, DetailPanel, MapMeta, TravelPill; 51-10 rail travel panel; 51-08 GraphPlane, GraphList, MapLegend; 51-02 regionChips; 51-07 MAP_KEY"
provides:
  - "src/map/MapSheet.vue: the mobile Map tab (region row, Regions listbox, Legend disclosure, Graph | List switch, canvas, dock); props { destination }; exposes focusCurrent, scrollToNode, focusName"
  - "src/map/MapDock.vue: the mobile dock (props { destination }; exposes focusName)"
  - "src/map/RegionsListbox.vue: the inline listbox (props chips, locked, timeText, aboutText; emits choose, close)"
  - "src/map/useMapGraph.ts: useMapGraph(mobile): the shared graph model (layout, views, rows, routes, chips, gates, shown region) read by MapScreen and MapSheet"
  - "MapScreen mobile branch: SegTabs 'Map sheet view' (Map, Here), the Here tab renders ContextContent, one NoticeLine at the bottom"
  - "GraphPlane mobile label variant (name plus level on one Micro 10 line)"
  - "REQUIREMENTS.md LDG-05 with one Travel button; 51-VALIDATION.md filled and signed off"
affects: [phase-51-verification, milestone-uat]

tech-stack:
  added: []
  patterns:
    - "One graph model (useMapGraph) and one destination model (useDestination) feed both the desktop Map and the mobile sheet"
    - "MapScreen reaches the canvas through a small surface (focusCurrent, scrollToNode) that is the plane on desktop and the sheet on mobile"

key-files:
  created:
    - src/map/MapSheet.vue
    - src/map/MapSheet.test.ts
    - src/map/MapDock.vue
    - src/map/MapDock.test.ts
    - src/map/RegionsListbox.vue
    - src/map/RegionsListbox.test.ts
    - src/map/useMapGraph.ts
    - src/map/mobileTargets.test.ts
  modified:
    - src/map/MapScreen.vue
    - src/map/MapScreen.test.ts
    - src/map/GraphPlane.vue
    - src/map/GraphPlane.test.ts
    - src/map/arrival.test.ts
    - src/frame/AppFrame.screens.test.ts
    - src/frame/AppFrame.populated.test.ts
    - .planning/REQUIREMENTS.md
    - .planning/phases/51-ledger-screens-world-and-people/51-VALIDATION.md

key-decisions:
  - "The graph computations moved out of MapScreen into useMapGraph so the mobile sheet cannot disagree with the desktop Map (a new file the plan did not list)"
  - "MapScreen's selection, arrival, region and focus rules now run on mobile too (canShow no longer needs the desktop layout); after an arrival focus goes to the dock's place name on mobile and the detail h4 on desktop"
  - "Choosing a region in the listbox shows it, closes the listbox and returns focus to the Regions button; the 'focus into the graph' rule stays for the desktop chips only"
  - "The dock Details body is capped at 45dvh (the sheet is about 90% of the viewport, so this is about half the sheet) because a percentage max-height has no definite parent here"
  - "The mobile canvas block reserves 240px for the canvas plus the 44px view switch above it, so the canvas keeps its 240px minimum"
  - "The arrival banner also shows on the mobile Map tab (top of the canvas, below the view switch); the UI-SPEC banner rule is not desktop-specific"

patterns-established:
  - "mobileTargets.test.ts lists every mobile control in src/map with its size rule and fails for a new <button> that is not listed"

requirements-completed: [LDG-04, LDG-05]

duration: about 90min
completed: 2026-10-07
---

# Phase 51 Plan 11: Mobile Map sheet and the Phase 51 gate Summary

**At 390x844 the Map tab opens a full-height sheet with Map and Here tabs, a region row with a Regions listbox, a Legend disclosure and a dock that shares the desktop destination model, every mobile control is proven 44px (48px for the dock button), LDG-05 now reads one Travel button, and the Phase 51 gate passes with 51-VALIDATION.md signed off.**

## Performance

- **Duration:** about 90 min
- **Tasks:** 3 of 3
- **Files:** 8 created, 9 modified (client and planning docs only; no server change, no publish, no prompt change)

## Accomplishments

- The Map sheet has the tablist 'Map sheet view' (Map, Here). The Map tab is the new MapSheet; the Here tab is ContextContent in a 16px column, so every rail action works on mobile. One NoticeLine sits at the bottom under both tabs, fed by the shared destination runner. Before the map data applies the Map tab draws nothing; with no location it shows the EmptyState.
- MapSheet: region row ('{Region}' 14/500, level in its band colour, a 44px 'Regions' button with aria-expanded, the compact pill), the 44px 'Legend' disclosure that expands MapLegend inline, the Graph | List switch above the canvas, the canvas with Center on you (44px) and the arrival banner, then the dock.
- RegionsListbox: role listbox, role option per chip, 44px options, aria-selected for the shown region, lock and time on every other region while the timer runs (the option stays operable), roving focus with arrows, Home, End, Enter and Space, Escape closes and the sheet stays open (the event is marked handled before it reaches the sheet's document handler).
- MapDock, in UI-SPEC order: name (not a heading, tabindex -1) and region line; tags; 'Crossing into {Region} · {Lv}' with PhDoorOpen 16; the trip line '{n} stamina · {region travel text}' (the clock inside it is aria-hidden with a screen-reader twin); the route note alone for far places; the fail line (PhWarningCircle in the WAIT colour, or the BAD colour when any check is bad) joining the failing labels with ' · '; the one 48px button and its note; the 44px 'Details' disclosure (description, Services, Players, quests; scrolls). Travel runs the same runner as the desktop panel (move_character, sheet stays open); Select first stop only selects.
- GraphPlane: on mobile the label is the name plus the level in its band colour on one Micro 10 line, no sub-line (the full sub-line stays in the node aria-label); gate pills keep the region name and the lock with m:ss while the timer runs.
- mobileTargets.test.ts checks the size rule of every mobile control in src/map (tabs, region row buttons, listbox options, disclosures, view switch, node hit box, gate slop, Center on you, rows, chips, dock button) and fails for any new `<button>` that is not listed.
- REQUIREMENTS.md LDG-05 now reads "...with one Travel button (Cross into {Region} at a border); party members with Follow leader on come along when the leader travels." (one scoped Edit; checkbox and traceability row untouched; 'Travel with party' count is 0).
- 51-VALIDATION.md: 29-row per-task map (51-01-T1 to 51-11-T3), requirement rows and Wave 0 list and sign-off ticked, approval `approved 2026-10-07 (51-11 phase gate)`, `nyquist_compliant: true`, `wave_0_complete: true`. `status` left as draft for /gsd-validate-phase.

## Task Commits

1. **Task 1: mobile Map sheet, dock, listbox, Legend disclosure, mobile labels** - `e655ef59` (feat). Includes the existing mobile frame tests that had to open the Here tab (AppFrame.screens.test.ts, AppFrame.populated.test.ts) and the new mobile flows in AppFrame.screens.test.ts.
2. **Task 2: 44px target checks and the LDG-05 wording** - `75cd89e9` (test)
3. **Task 3: validation map and Nyquist sign-off** - `cc133750` (docs)

## Gate results (run 2026-10-07, repo root, single or two workers)

| # | Command | Result |
|---|---------|--------|
| 1 | `npx vitest run --dir src --maxWorkers=2` | 187 files, 4208 tests, all passed |
| 2 | `npx vitest run --dir spacetimedb --maxWorkers=1 --exclude "**/measurement.results.test.ts"` (run from the repo root, not `cd spacetimedb`, because salvage_result.test.ts needs the root) | 126 files, 4896 tests, all passed |
| 3 | `npx vitest run scripts --maxWorkers=1` | 8 files passed (554 tests); only failures are the two known baseline files scripts/llm/call_log_report.test.mjs and scripts/llm/proof_rules.test.mjs (fail to load, as before) |
| 4 | `npx vue-tsc -b` | exit 0 |
| 5 | guards: src/styles, frameContract, legacyClientRemoval, mapGuards, effectChipsGuards, no_ripple_word | 9 files, 236 tests, all passed |

The plan used `pnpm exec`; pnpm is not on this host's PATH, so `npx` was used. Also re-run on their own: the 51-03-T3 checks (spacetimedb/src clean, key 108 before and after, no panic in the last 80 log lines, `myVisitedLocations` in the bindings), and the 51-11-T2 and T3 verify commands including the frontmatter and row-count greps (29 rows, 0 pending outside the legend line).

## Decisions Made

See key-decisions above. None needed owner input to proceed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Existing mobile Map tests expected the rail on the Map tab**
- **Found during:** Task 1 (full src/frame run)
- **Issue:** The Map sheet now opens on the Map tab, so tests that opened the Map tab and expected Here, Nearby, Tracking, exit rows, Invite or Whisper failed: AppFrame.screens.test.ts (2), AppFrame.populated.test.ts (3), arrival.test.ts (1, 'on mobile nothing is selected'), MapScreen.test.ts (2, the 'keeps the Here view' and a source check for `layoutGraph(`).
- **Fix:** Each now opens the Here tab first (a helper in each file) or asserts the new mobile behaviour; no assertion was weakened (the Here-tab content assertions are unchanged, and the mobile arrival test now proves select, banner and dock focus). AppFrame.populated.test.ts and arrival.test.ts were not in the plan's file list.
- **Files modified:** src/frame/AppFrame.populated.test.ts, src/frame/AppFrame.screens.test.ts, src/map/arrival.test.ts, src/map/MapScreen.test.ts
- **Commit:** e655ef59

**2. [Rule 3 - Blocking] New file useMapGraph.ts**
- **Issue:** MapSheet and MapScreen both need the layout, views, rows, routes, chips and gates. Duplicating them would let the two layouts disagree, and the plan's MapSheet props are only `{ destination }`.
- **Fix:** Moved the computeds out of MapScreen into src/map/useMapGraph.ts (`useMapGraph(mobile)`); MapScreen and MapSheet both call it. Desktop behaviour unchanged (all 51-08/09 MapScreen tests pass untouched, apart from the one source check noted above).
- **Commit:** e655ef59

### Process note

The three new components were implemented before their test files were written (not strict RED then GREEN), because the models were already tested and the view code was exploratory. Tests were then written against the stated behaviour and all pass; they cover every behaviour line in the plan. The existing-test breakages in item 1 were the RED signal for the MapScreen change.

## Known Stubs

None. The Players count still includes offline characters until Phase 51.1 (decided in 51-05).

## Threat Flags

None. Every server string (place, region, quest names, descriptions) renders as a text node or a bound attribute in the dock, listbox and labels; MapDock, RegionsListbox, MapSheet, MapScreen and GraphPlane tests put an img onerror payload in a place or region name and assert no img and the payload as text (T-51-42). The dock never calls the reducer itself: the shared runner ignores a second call while pending (T-51-44) and move_character re-checks every trip (T-51-43). One scoped edit of the LDG-05 line (T-51-45).

## Deferred visual UAT (backstop items for the owner's end-of-milestone check)

These cannot run in happy-dom. Phase-wide list, by plan:

- **51-08:** M1 route graph with a 20-place region at 1280 and 900 (plane scrolls both axes, labels clear at the 192 x 72 pitch, view switch, Center on you and banner do not cover nodes); M2 legend row at 900 (wraps to at most three lines); M9 gate pills with two cross-region edges at adjacent rows (no overlap with each other or a label).
- **51-09:** M3 region chips with 8 regions at 900 and 1280 (chips wrap, canvas keeps 320px); M4 the Region travel pill never wraps in that header; M5 detail column with a crossing, the checklist, two quests and a long description at 256 and 304 wide (body scrolls, button stays docked).
- **51-10:** R4 mobile location line and exit chips at 390 with 8 exits and long names (horizontal scroll, 44px chips, chip line 1 ellipsis at 144px); the 256px desktop rail with a crossing row's name plus region suffix; the Here card sub-line and kicker/timer chip at long names.
- **51-11:** S1 mobile Map sheet at 390x844 with a crossing, a fail line and Details closed (canvas keeps 240px, dock button stays visible; open Details scrolls and stays within about half the sheet, which is 45dvh here); M2 the Legend disclosure expands inline above the canvas without pushing the dock button off screen; M3 at 390 the open Regions listbox reaches every option at 44px.
- **Manual, from 51-VALIDATION.md:** the Map reads well at 1280 and 390x844 (open, pick places, travel, cross a border); a passage collapsing in a live world (needs a real uncharted crossing and a paid LLM call, owner go-ahead).
- Also worth a look on a phone: the arrival banner position under the view switch, and focus landing on the dock place name after a Travel.

## Open owner-review items

Research assumptions flagged for the owner:
- **A1 (own side):** the sweep sends an offline character in a passage to the visited row's `fromLocationId` when that is an own-region neighbour, else the lowest-id own-region neighbour; never across the border. Alternative: the bound location's region.
- **A3 (5-minute sweep):** interval is `PASSAGE_SWEEP_INTERVAL_MICROS` (300s); 'offline' means no player row has that active character.
- **A4 (players include offline):** the Map's Players count includes offline characters until Phase 51.1 adds the stored online flag (`onlineCharacterIds` swaps its body then).
- **A9 (look copy):** plain deterministic server copy, no Keeper voice. `look at {neighbour}`: the name, `Next to {here}.` or `, across the border in {Region}.` (fallback `another region`), then the description or `Nobody has been here yet.` `look at bind stone` (only where a stone exists): `Bind stone` plus `You are bound here. You return here after defeat.` or, when not bound, `You are not bound here. Bind here to return after defeat.`

Planner and executor copy choices to approve or change:
- **'about 1 minute'** singular in the minute sentence (`aboutMinutes`), not 'about 1 minutes'.
- **'1 stop' vs '{n} stops'** (51-02): `routeNote` prints '1 stop' for a single step and '{n} stops' otherwise; the UI-SPEC had only the plural. One-line revert in src/map/route.ts.
- **Uncharted note, follower part:** 'Travelling here opens a new region.' followed by ' {n} following.' when you lead followers, or ' Only you travel.' for a member (the neighbour notes use 'Arrive instantly · {n} following' and 'Arrive instantly · only you travel').
- **Labels for several blocked followers:** names joined with ', ' and ' and ' ('{A, B and C} can't cross yet'; '{names} are short on stamina'; a single one reads '{Name} is short on stamina').
- **One card per quest, roles joined ' · ':** a place that is a quest's giver, goal and pick-up shows one card with 'Giver here · Goal here' rather than several.
- **Mobile location line without Day/Night** (51-10): pin, name, terrain, level in its danger colour and the region-travel chip; the time of day stays in the desktop HeaderBar only.
- **Also new in this plan:** the dock fail-line colour is the BAD colour when any failing check is bad, else the WAIT colour; the arrival banner also shows on the mobile Map tab.

## Notes for the verifier

- Phase 51 is complete: all 11 plans have summaries. The server (51-01, 51-03) is published to the owner's local uwr database; no maincloud publish was done.
- Baseline failures (unchanged): scripts/llm/call_log_report.test.mjs, scripts/llm/proof_rules.test.mjs, spacetimedb/src/helpers/measurement.results.test.ts (excluded in the module run).

## Self-Check: PASSED

- Files found: src/map/MapSheet.vue, MapDock.vue, RegionsListbox.vue, useMapGraph.ts and their tests, src/map/mobileTargets.test.ts, 51-VALIDATION.md.
- Commits found: e655ef59, 75cd89e9, cc133750.
- Acceptance greps: 'Map sheet view' in MapScreen.vue 1; role="listbox" in RegionsListbox.vue 1; 'min-height: 48px' in MapDock.vue at least 1; 'Details' and 'destination' in MapDock.vue; 'one Travel button' in REQUIREMENTS.md 1; 'Travel with party' 0; nyquist_compliant and wave_0_complete lines 1 each; 29 task rows; 0 pending outside the legend line.
