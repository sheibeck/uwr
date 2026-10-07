---
phase: 51-ledger-screens-world-and-people
plan: 13
subsystem: ui
tags: [vue, map, accessibility, gap-closure, owner-request, client, docs]
status: complete
gap_closure: true

requires:
  - phase: 51-ledger-screens-world-and-people
    provides: "51-08 GraphPlane (roving tabindex, per-node aria-label); 51-11 MapSheet; 51-12 layout, useMapGraph and the measured canvas"
provides:
  - "The Map canvas (desktop screen and mobile sheet) is the route graph only: no Graph / List switch, no list panel"
  - "Graph keyboard and aria tests that carry the guarantee the List gave: every drawn place is keyboard-reachable (arrows, Home, End) and has its full aria-label"
affects: [phase-51-verification, milestone-uat]

tech-stack:
  added: []
  patterns:
    - "The plane sits in a plain .canvas-scroll area (position absolute inset 0 on desktop, flex 1 min-height 240 on mobile) that GraphPlane measures through its parent, as the SegTabs panel did before"

key-files:
  created: []
  modified:
    - src/map/MapScreen.vue
    - src/map/MapSheet.vue
    - src/map/useMapGraph.ts
    - src/map/nodeView.ts
    - src/map/mapContext.ts
    - src/map/mapData.ts
    - src/map/GraphPlane.test.ts
    - src/map/MapScreen.test.ts
    - src/map/MapSheet.test.ts
    - src/map/arrival.test.ts
    - src/map/mapData.test.ts
    - src/map/nodeView.test.ts
    - src/map/mobileTargets.test.ts
  deleted:
    - src/map/GraphList.vue
    - src/map/GraphList.test.ts

key-decisions:
  - "List view removed on the owner's request (2026-10-07: 'I think we should remove list view from the map. That seems ... not as fun as as the graph. Why do we have list?'). It came from our UI-SPEC as a screen-reader and keyboard equivalent, not from the mock, and the graph now carries that itself."
  - "The hub's view / setView state and the MapView type only served the switch, so they are removed; the mobile Map / Here tabs (Map sheet view) are a different switch and stay."

patterns-established: []

requirements-completed: []

duration: 25min
completed: 2026-10-07
---

# Phase 51 Plan 13: Remove the Map List view Summary

The Map is the route graph only: the Graph / List switch, the `GraphList` panel, the list row model and the hub's view state are gone, and the graph's own keyboard and aria tests now cover what the List used to guarantee.

## What was removed

- `src/map/GraphList.vue` and `src/map/GraphList.test.ts` (deleted).
- The `SegTabs` Graph / List switch (tablist `Map view`, `PhGraph`, `PhListBullets`) from the desktop Map canvas (`MapScreen.vue`) and from the mobile Map sheet (`MapSheet.vue`). Center on you now always shows. The mobile `Map` / `Here` tabs (`Map sheet view`), the legend, the arrival banner, the dock and everything else are unchanged.
- `listRows`, `ListRow` and their helper `stepsText` from `nodeView.ts`; `rows` from `useMapGraph.ts` (nothing else used them).
- `MapView`, `view` and `setView` from `mapContext.ts`, `mapData.ts` and the inert map (they only served the switch).
- The plane now sits in a plain `.canvas-scroll` area instead of the SegTabs panel; the sheet canvas keeps its 240px minimum and no longer reserves room for the switch; the mobile banner moved from 48px to 8px from the top.

## Tests

- `GraphPlane.test.ts`: new test that walks the keyboard (arrows, Home, End) from the single tab stop and reaches every drawn place, each a button whose `aria-label` is the full node label.
- `MapScreen.test.ts` and `MapSheet.test.ts`: the List-switch tests became "graph only, no tablist, no list, Center on you present" and "every drawn place is a keyboard-reachable button with its full spoken label" (labels checked for state and steps).
- `nodeView.test.ts`: the `listRows` block became a block on views in reading order, full spoken labels (including `no known path`, `n steps from here`) and the selected state.
- `arrival.test.ts`: the "list row clears the banner" test became "a gate pill clears the banner".
- `mapData.test.ts`, `mobileTargets.test.ts`: no view state; the 44px target table and button-coverage table drop `GraphList.vue`; the sheet no longer uses `SegTabs`.
- Results: `npx vue-tsc -b` clean; `src/map`, `src/screens` 749 tests green; full `npx vitest run` 9968 passed, 2 failed, all in the baseline `spacetimedb/src/helpers/measurement.results.test.ts` (the other two baseline files, `scripts/llm/call_log_report.test.mjs` and `proof_rules.test.mjs`, also fail to load, as before).

## Docs

- `51-UI-SPEC.md`: removed the List view block, the icon row, the layout-diagram switch lines, the mobile `Graph | List` switch, the List-view row in the interaction table, the copy rows (view switch, List row sub-line), the M10 element and all seven M10 state rows; the accessibility lines now say the graph's `aria-label` and keyboard reach carry it; added a Supersedes row "List view removed (owner, 2026-10-07)".
- `51-CONTEXT.md`: new section "Owner play-test: no List view (2026-10-07)" with the verbatim quote and the decision; MS-05 notes the supersession.
- `51-VALIDATION.md`: the 51-08-T2 command and the LDG-04 node-states row no longer mention the List.

## Deviations from Plan

None - there was no plan file; the instructions were followed as given. The SUMMARY's `requirements-completed` is empty because no requirement changes status.

## Self-Check: PASSED

- `src/map/GraphList.vue` and `src/map/GraphList.test.ts` are gone; no remaining references to `GraphList`, `listRows`, `ListRow`, `setView` or `MapView` in `src`.
- Code commit `0cde3100` exists.
