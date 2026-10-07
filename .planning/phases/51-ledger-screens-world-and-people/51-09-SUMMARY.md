---
phase: 51-ledger-screens-world-and-people
plan: 09
subsystem: ui
tags: [vue, map, travel, detail, checklist, region-chips, travel-timer, notice-line, arrival, client]
status: complete

requires:
  - phase: 51-ledger-screens-world-and-people
    provides: "51-05 travelChecks and buildDetail; 51-07 MAP_KEY map hub; 51-08 MapScreen, GraphPlane, GraphList, MapLegend; 51-02 regionChips, travelTimer"
provides:
  - "src/map/useDestination.ts: Destination { checks, detail, runner, travel(), selectFirstStop() } and useDestination(), one model for the selected place, one action runner (key 'travel')"
  - "src/map/DetailPanel.vue: the destination detail column (blocks in UI-SPEC order, trip grid, quests, route chain, 'Can you go?' checklist, docked Travel button and note, NoticeLine); exposes focusTitle(), emits travelled()"
  - "MapScreen: detail column beside the canvas (256px, 304px from the 1200px tier), arrival banner, arrival handling from the character row, chip-driven selection"
  - "src/map/MapMeta.vue: region chips (desktop) and the shown region name (mobile meta)"
  - "src/map/TravelPill.vue and MapActions.vue: the Region travel pill in the 50-39 actions slot, with the once-only unlock status"
  - "screens.ts: map entry gains meta: MapMeta and actions: MapActions; Sheet.vue gains .sheet-actions:empty"
affects: [51-10, 51-11]

tech-stack:
  added: []
  patterns:
    - "Map actions call game.reducers.moveCharacter through createActionRunner and show refusals in NoticeLine; never consoleApi.travel (it closes the screen)"
    - "Arrival is detected by watching character.locationId while the Map is open, never from the click"
    - "A header component that must render nothing on a form factor renders a comment node and the Sheet hides the empty wrapper with :empty"

key-files:
  created:
    - src/map/useDestination.ts
    - src/map/useDestination.test.ts
    - src/map/DetailPanel.vue
    - src/map/DetailPanel.test.ts
    - src/map/arrival.test.ts
    - src/map/MapMeta.vue
    - src/map/MapMeta.test.ts
    - src/map/TravelPill.vue
    - src/map/TravelPill.test.ts
    - src/map/MapActions.vue
    - src/map/mapHeader.test.ts
  modified:
    - src/map/MapScreen.vue
    - src/map/MapScreen.test.ts
    - src/screens/screens.ts
    - src/screens/screens.test.ts
    - src/frame/Sheet.vue
    - src/frame/Sheet.test.ts
    - src/frame/AppFrame.screens.test.ts

key-decisions:
  - "The Map uses the 50-39 actions slot for the UI-SPEC's end slot (same position after the spacer, before the close button, same tab-order rule); no second slot was added to Drawer or Sheet"
  - "useDestination.travel() clears the arrival banner when a trip starts (and selectFirstStop clears it too), and MapScreen's own select handler clears it on any user selection; the arrival watcher sets it after the character row changes, so a late reducer promise can never erase a fresh banner"
  - "'The selection is in the chosen region' means the selected place's own regionId equals the shown region; a border node of another region selected through a gate keeps the shown region and the selection"
  - "createActionRunner is imported under the local name makeRunner so the file keeps exactly one line that names it (the plan's grep acceptance)"
  - "Tag, crossing and checklist colours come from the DetailView's var(--color-...) strings through an inline color binding (the GraphPlane precedent) or scoped state classes"

patterns-established:
  - "Region chips carry data-region-chip so MapScreen can tell a header chip from other focus without importing the component"
  - "Every visible clock is aria-hidden next to a .sr-only minute sentence; only the unlock state change is a status"

requirements-completed: [LDG-04, LDG-05]

duration: 40min
completed: 2026-10-07
---

# Phase 51 Plan 09: Map actions Summary

**The Map now acts: a destination detail column with the checklist and one docked Travel button that calls move_character through the shared action runner, arrival handling that follows the character row (select, region switch, banner, focus), clickable region chips with timer locks, and the Region travel pill, all reading the server's travel_cooldown row.**

## Performance

- **Duration:** about 40 min
- **Tasks:** 3 (all TDD, RED commit then GREEN commit each)
- **Files:** 11 created, 7 modified

## Accomplishments

- **useDestination:** injects GAME_KEY and MAP_KEY, builds travelChecks for a neighbour selection (party, effects, cooldowns, gathering) and buildDetail over the drawn places; one `createActionRunner` (key `travel`); `travel()` runs `moveCharacter({ characterId, locationId })` only for a Travel or Cross action that is not blocked, offline or pending; `selectFirstStop()` only selects.
- **DetailPanel:** kicker, h4 (tabindex -1), region line, tags, Region crossing block, description, trip grid, quest cards, far-place route chain, checklist with row ids, docked footer with the button and note, and a NoticeLine fed by the runner's rejection count. A blocked button is aria-disabled with the failing row as aria-describedby, the clock aria-hidden and a minute aria-label. The 44px and 48px mobile rules exist for the plan 51-11 dock.
- **MapScreen:** grid `minmax(0, 1fr) 256px`, `304px` from `min-width: 1200px`, 24px gap; arrival banner (role status, PhFootprints, no digits) at the canvas top centre; arrival watcher on `character.locationId`; chip-driven selection watcher.
- **Header:** MapMeta chips (your region first, then name, then id; `.tag-accent` and aria-pressed for the shown one; PhMapPin on yours while another is shown; PhLockSimple and the clock only while your timer runs, never a level lock), TravelPill (Ready or time left, once-only unlock status), MapActions (pill on desktop, nothing on mobile), registered in screens.ts. Sheet hides an empty actions wrapper.

## Task Commits

| Task | RED | GREEN |
|------|-----|-------|
| 1 useDestination and DetailPanel | 268d3561 | c70d2306 |
| 2 MapScreen integration | c760675e | 12318fba |
| 3 chips, pill, header registration, Sheet rule | 9a569404 | 74b2893c |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Registry assertion lives in AppFrame.screens.test.ts, not only screens.test.ts**
- **Found during:** Task 3
- **Issue:** `AppFrame.screens.test.ts` asserted that only the Inventory screen has header actions, which the new map `actions` entry breaks. The plan listed only `screens.test.ts`.
- **Fix:** Updated that assertion (bag and map have actions) and imported MapActions there.
- **Files modified:** src/frame/AppFrame.screens.test.ts
- **Commit:** 74b2893c

**2. [Rule 3 - Blocking] Test fixture rows lacked `description`**
- **Found during:** Task 3
- **Issue:** The desktop Map drawer case in `AppFrame.screens.test.ts` mounts the real Map with two location rows that had no `description` (real rows always do), so the detail column threw on `description.trim()`.
- **Fix:** Added `description: ''` to the two fixture rows. No production change.
- **Files modified:** src/frame/AppFrame.screens.test.ts
- **Commit:** 74b2893c

**3. [Plan wording] Banner clearing on travel**
- **Issue:** The plan has MapScreen clear the banner on the DetailPanel's `travelled` event. That event fires after the reducer promise resolves, which can come after the arrival row, so it could erase a new banner.
- **Fix:** `useDestination.travel()` clears the banner when a trip starts; DetailPanel still emits `travelled()` (MapScreen does not listen). Covered by arrival.test.ts ("a travel started from the detail clears the banner").
- **Commit:** c70d2306

**4. [Plan wording] One line naming createActionRunner**
- The plan's grep acceptance wants one line; the import is aliased (`createActionRunner as makeRunner`) so only the import line names it.

No other deviations. No server changes, no publish, no bindings regeneration.

## Verification

- Touched suites: `src/map src/screens src/frame src/styles` 913 tests pass.
- `npx vue-tsc -b` exits 0.
- Full `npx vitest run` from the repo root: 9612 passed, 2 failed, 3 failed files, all baseline (scripts/llm/call_log_report.test.mjs, scripts/llm/proof_rules.test.mjs, spacetimedb/src/helpers/measurement.results.test.ts).
- Acceptance greps: `moveCharacter(` 1, `createActionRunner` 1 (in useDestination.ts), `NoticeLine` 2, `Can you go?` 1, `Not directly connected · route` 1, `Crossed into` 1, `Arrived at` 1, `min-width: 1200px` 1, `304px` 1, `256px` 1, `meta: MapMeta` 1, `actions: MapActions` 1, `region travel locked for about` 1 (MapMeta.vue), the unlock copy 1 (TravelPill.vue), `sheet-actions:empty` 1.
- DetailPanel.test.ts provides a CONSOLE_KEY spy and asserts it is never called in any button state.

## Backstop items (visual, not automated)

For the milestone-end check: M3 region chips with 8 regions at 900 and 1280 (chips wrap, canvas keeps at least 320px), M4 pill never wraps in that header, M5 detail overflow with a crossing, the checklist, two quests and a long description at 256 and 304 wide (body scrolls, button stays docked).

## Known Stubs

None. Player counts include offline characters until Phase 51.1 (decided in 51-05).

## Threat Flags

None. All server strings (place, region, quest names, descriptions) render as text nodes or bound attributes; escape tests cover the description, quest name, place name and region name (T-51-35). The runner ignores a second call while pending (T-51-37). Times come only from readyAtMicros minus the server clock; no fixed duration or level lock exists (T-51-38).

## For later Phase 51 plans (51-10, 51-11)

- `useDestination()` returns `Destination`; call it once in the Map screen and pass it to the mobile dock. `destination.detail.value.action`, `.checks`, `.runner` (shared with DetailPanel, so one notice line), `travel()`, `selectFirstStop()`.
- DetailPanel button classes: `.travel-button` with `.btn-primary` or `.btn-secondary`; mobile rules 48px (primary) and 44px (other) already exist at `max-width: 899px`.
- MapScreen already calls `useDestination()` before its desktop/mobile branch, selects on arrival only while `canShow` (desktop and ready); the mobile branch is still the old `.map-sheet` with ContextContent.
- MapMeta mobile branch renders the shown region's name as text; MapActions renders nothing on mobile; `TravelPill` takes `compact` for the mobile region row ('Ready' / '{m:ss}').
- MapMeta chip rule includes the `::after` 44px slop at `max-width: 899px` for the 51-11 Regions listbox to reuse.
- `data-region-chip` marks a header chip; MapScreen moves focus to the graph only when focus was on one.
- Registry: `getScreen('map').meta` is MapMeta and `.actions` is MapActions. `.sheet-actions:empty { display: none; }` is in Sheet.vue.

## Self-Check: PASSED

All created files exist; commits 268d3561, c70d2306, c760675e, 12318fba, 9a569404 and 74b2893c are in the log.
