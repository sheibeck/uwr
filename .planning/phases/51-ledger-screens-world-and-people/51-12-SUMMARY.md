---
phase: 51-ledger-screens-world-and-people
plan: 12
subsystem: ui
tags: [vue, map, graph-layout, stress-layout, deterministic, resize-observer, accessibility, gap-closure, client]
status: complete

requires:
  - phase: 51-ledger-screens-world-and-people
    provides: "51-04 graphLayout and nodeView; 51-08 GraphPlane; 51-11 useMapGraph, MapSheet; client review fixes (useShownRegion, regionChosen, trip guard)"
provides:
  - "src/map/graphLayout.ts: two-dimensional stress layout that fills a measured canvas; exports layoutGraph, regionStartId, compareReading, types Side, CanvasSize, LabelBox, and the spacing constants (MIN_NODE_GAP 160, COMPACT_MIN_NODE_GAP 112, NODE_HIT 32, COMPACT_NODE_HIT 44, GATE_CLEAR 16, LABEL_CLEAR 4, OUTER_GAP 64, MAX_EDGE 360, ...)"
  - "LayoutNode { id, x, y, side: Side | null, label: LabelBox }; LayoutGate.side is a Side; caption { x, y, w, h } | null (null on mobile); nodes and gates in reading order"
  - "src/map/order.ts: compareNames with the fixed 'en' locale (IN-06)"
  - "NodeView.label (LabelBox) replaces labelSide; listRows in reading order"
  - "GraphPlane: labels from their layout box (align-left/right/center), caption max-width, spatial arrow keys, emits resize: [CanvasSize] from a ResizeObserver on its parent (the scroll area)"
  - "MapGraph: canvas, setCanvas(size | null), startIdFor(regionId); layoutFor removed; layout uses canvas and compact: mobile()"
  - "MapSheet props { destination, graph }: the one graph MapScreen builds"
  - "mapData: known depends on a primitive currentLocationId computed (WR-03)"
affects: [phase-51-verification, milestone-uat]

tech-stack:
  added: []
  patterns:
    - "Pure layout with the measured canvas as an input: ResizeObserver in the component, whole pixels, equal sizes ignored at both ends"
    - "One MapGraph per Map screen, passed to the mobile sheet as a prop"
    - "Coordinates rounded to whole pixels before anything is placed around them, so test clearances hold exactly"

key-files:
  created:
    - src/map/order.test.ts
    - src/map/useMapGraph.test.ts
  modified:
    - src/map/graphLayout.ts
    - src/map/graphLayout.test.ts
    - src/map/order.ts
    - src/map/nodeView.ts
    - src/map/nodeView.test.ts
    - src/map/GraphPlane.vue
    - src/map/GraphPlane.test.ts
    - src/map/mapData.ts
    - src/map/mapData.test.ts
    - src/map/useMapGraph.ts
    - src/map/MapScreen.vue
    - src/map/MapScreen.test.ts
    - src/map/MapSheet.vue
    - src/map/MapSheet.test.ts
    - .planning/phases/51-ledger-screens-world-and-people/51-UI-SPEC.md
    - .planning/phases/51-ledger-screens-world-and-people/51-VALIDATION.md

key-decisions:
  - "Stretch (ky / kx) comes from the room the canvas leaves for the centres (canvas minus margins, outer bands, outline padding and hit boxes), not the raw canvas; when even the minimum scale does not fit, the stretch drops to 1 so a scrolling region scrolls no further than it must"
  - "Region labels prefer slots inside the region's centre box padded 48 (56 top), so edge labels turn inward; any clear slot is the fallback (keeps the plan's labels-before-outline order and fixes the prototype's single-place gap)"
  - "The bisect tests the filled placement (fill on), so the final layout is exactly the canvas for all four live regions"
  - "Outer bands are asymmetric: a bottom border place's label reaches 26px below it, so the bottom band is OUTER_GAP + 26 + 8 on desktop"
  - "Each grow retry scales both the layout and the outline by 1.2, and each outline side is long enough for its border places plus one gate width; this fixes one- and two-place regions with several border places, where scaling alone moved nothing"
  - "MapSheet takes the graph as a prop (the fixer shares chips with MapMeta through useShownRegion, which holds no layout, so it was not a sharing mechanism for the graph)"

patterns-established:
  - "Spatial arrow keys: nearest place in the pressed direction, 45-degree cone first, forward + 2 x sideways, ties in reading order"

requirements-completed: [LDG-04]

coverage:
  - id: D1
    description: "Two-dimensional layout: Sennet Basin bends, every live region keeps 160px (112px mobile) and fills 652 x 600, other regions outside the outline on the facing side, no overlaps of labels, pills or caption"
    requirement: LDG-04
    verification:
      - kind: unit
        ref: "src/map/graphLayout.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "The Kesterlane gate pill keeps 16px from Cormorant Stair; gate pills keep 16px from every hit box, label, caption and pill on desktop and mobile (CR-01)"
    requirement: LDG-04
    verification:
      - kind: unit
        ref: "src/map/graphLayout.test.ts#Tessarine Shelf"
        status: pass
    human_judgment: false
  - id: D3
    description: "Reading order for nodes, List, End and gate pills; spatial arrow keys (IN-07, MS-05); fixed 'en' name order (IN-06)"
    requirement: LDG-04
    verification:
      - kind: automated_ui
        ref: "src/map/GraphPlane.test.ts; src/map/nodeView.test.ts; src/map/order.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Measured canvas through one shared MapGraph (desktop and mobile); the regen tick no longer re-runs known places or the layout (WR-03 layout part)"
    requirement: LDG-04
    verification:
      - kind: automated_ui
        ref: "src/map/MapScreen.test.ts; src/map/MapSheet.test.ts; src/map/useMapGraph.test.ts; src/map/mapData.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "Visual check of the spread-out map at 1280x800 and 390x844 (Sennet Basin, Tessarine Shelf, Orrowmere Teeth)"
    verification: []
    human_judgment: true
    rationale: "Visual quality of the layout on the real canvas; deferred to the end-of-milestone UAT (MS-08)"

duration: 46min
completed: 2026-10-07
---

# Phase 51 Plan 12: Two-dimensional map layout Summary

**Deterministic stress layout that bends Sennet Basin, fills the measured 652 x 600 canvas for all four live regions with 160px spacing, puts other regions outside the outline on the facing side, and keeps every label, gate pill and caption clear; one shared graph feeds desktop and mobile.**

## Performance

- **Duration:** about 46 min
- **Started:** 2026-10-07T11:44:00Z
- **Completed:** 2026-10-07T12:30:00Z
- **Tasks:** 3 of 3
- **Files modified:** 18 (2 created)

## Accomplishments

- `layoutGraph` is a two-dimensional stress layout (MS-01): golden-angle seeds in breadth-first order, distances softened to the power 0.6, 200 Gauss-Seidel sweeps and a 1-unit spread, the principal axis along the canvas's longer side, the start in the top-left quadrant.
- The region fills the measured canvas (MS-02). The minimum spacing is 160px on desktop and 112px on mobile (MS-03). Other regions sit 64px outside the outline on the side that faces their neighbours (MS-04). Labels, the caption corner and sliding gate pills keep their clearances (CR-01). The caption shows on desktop only (MS-07).
- Nodes, the List view, End and the gate pills share one reading order (IN-07). Arrow keys move to the nearest place in their direction (MS-05). Names sort with the fixed 'en' locale (IN-06).
- GraphPlane measures its scroll area with a ResizeObserver and emits `resize`. MapScreen builds the one MapGraph and passes it to MapSheet. A row update that keeps the place no longer rebuilds known places or the layout (WR-03, layout part).
- The UI-SPEC "Route graph", caption, gate pill and keyboard rules now describe the new layout, with a Supersedes line. VALIDATION has the 51-12 task rows and the manual spacing check.

## Fixture results at 652 x 600 (desktop)

| Region | Plane | Min place gap | Other notes |
|--------|-------|---------------|-------------|
| Sennet Basin | 652 x 600 | 175px | aspect 1.53; middle places 72, 77 and 82px off the line through their neighbours; Wend Marsh on top, facing Kettlewick Landing |
| Tessarine Shelf | 652 x 600 | 182px | Kesterlane gate 44px from Cormorant Stair's hit box and 50px from its label |
| Kesterlane Basin | 652 x 600 | 178px | Cormorant Stair at the bottom |
| Orrowmere Teeth | 652 x 600 | 163px | both other regions on top |

- No edge comes within 139px of a place it does not connect (minimum over the four fixtures).
- A 30-place region with four other-region places takes a median of about 11ms after warm-up (range 10 to 20ms). The test bound is 20ms.
- Mobile (358 x 320, compact) and no-canvas layouts keep every clearance. They scroll where the region cannot fit.
- An ad-hoc fuzz run (not committed) laid out 1,400 generated regions: 1 to 14 places, 0 to 4 other-region places, four canvas modes. It found no overlap and no spacing breach, and the worst time was about 18ms.

## Task Commits

1. **Task 1: layout engine and fixed-locale names.** `3105abe0` (test, RED), `83b5f1bd` (feat, GREEN).
2. **Task 2: node views, labels, reading order, spatial arrows and the measured canvas.** `22dc4d92` (test, RED), `253e1adc` (feat, GREEN).
3. **Task 3: shared graph, canvas feed, WR-03, spec and validation.** `68f64f71` (feat; tests and implementation in one commit, the mapData, MapScreen and MapSheet tests were seen RED first).

## Files Created/Modified

- `src/map/graphLayout.ts`: rewritten as private steps: collect, solve, orient, sidesOf, stretchFor, scaleRange, then attempt (labels, outline, border places, caption, gates), then finish.
- `src/map/order.ts`: compareNames uses `localeCompare(b, 'en', { sensitivity: 'base' })`.
- `src/map/nodeView.ts`: `NodeView.label`; listRows uses compareReading.
- `src/map/GraphPlane.vue`: label boxes and align classes, caption max-width with ellipsis, spatial arrows, the ResizeObserver and the `resize` emit.
- `src/map/useMapGraph.ts`: canvas, setCanvas, startIdFor and the compact layout; layoutFor removed.
- `src/map/mapData.ts`: the `currentLocationId` computed feeds `known`.
- `src/map/MapScreen.vue`: `:graph="graph"` to MapSheet, `@resize="graph.setCanvas"`, a canvas reset on a desktop/mobile switch, a re-scroll on the first measurement, and startIdFor for arguments and the region watcher.
- `src/map/MapSheet.vue`: the `graph` prop (no own useMapGraph) and `@resize="props.graph.setCanvas"`.

## Decisions Made

See key-decisions in the frontmatter. The owner confirmed on 2026-10-07 that the map may shift as new places are discovered. The first open lays out at the minimum spacing, then lays out again once the canvas is measured.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The plan's step order could not fill the canvas.** Labels come before the outline, and the outline pads around them.
- **Found during:** Task 1
- **Issue:** Sennet Basin laid out at 738 x 638 and Tessarine Shelf at 652 x 632, against the required 652 x 600. Labels at the edge of the region pushed the outline out, and the canvas aspect ignored the outer bands.
- **Fix:**
  - Labels prefer slots inside the region's centre box, then any clear slot.
  - The stretch comes from the room the canvas leaves for the centres.
  - The bisect tests filled placements.
  - The bottom band counts the label's reach below its node.
- **Files modified:** src/map/graphLayout.ts
- **Commit:** 83b5f1bd

**2. [Rule 1 - Bug] Small regions with several border places failed to place their gates.**
- **Found during:** Task 1 (fuzz check)
- **Issue:** Growing the scale moves nothing in a one-place region, so the gates never found room.
- **Fix:** Each grow also scales the outline. Each outline side is long enough for its border places plus one gate width.
- **Commit:** 83b5f1bd

**3. [Rule 1 - Bug] Rounding could break the 160px gap by a fraction of a pixel.**
- **Fix:** The minimum scale aims for the gap plus 2px.
- **Commit:** 83b5f1bd

**4. Step order inside the placement.**
- The caption (plan step 9) must avoid the gates' first spots, and those need the border places (step 10).
- The order is therefore: region labels, outline, border places, caption, border labels, gates.
- When the caption takes the top strip, the border places are placed again.

**5. TDD order in Task 3.** The `useMapGraph.test.ts` file was written right after the useMapGraph change, not before it. The mapData, MapScreen and MapSheet tests were RED first.

## Known Stubs

None.

## Visual backstop (end-of-milestone UAT, MS-08)

- At 1280x800, open the Map on Sennet Basin, Tessarine Shelf and Orrowmere Teeth. Check that the places spread out, the pills sit clear of places, and other regions sit outside the outline on the facing side.
- At 390x844, check the same regions in the mobile sheet.
- Check that the first open shifts once to fill the canvas after it is measured.

## Next Phase Readiness

- Later plans read `layout.nodes[].label` and `side` (no column, outer or labelSide fields).
- They use `graph.startIdFor(regionId)` instead of a full layout.
- They pass the MapScreen graph to any new mobile surface.
- `MIN_NODE_GAP` is one constant if the owner wants 180px.

## Test Results

- Touched tests: graphLayout (149), order, nodeView, GraphPlane, mapData, useMapGraph, MapScreen, MapSheet and mobileTargets all pass.
- `npx vitest run src/map src/frame --maxWorkers=2` passes (1101 tests). `npx vitest run src/styles` passes (75).
- `npx vue-tsc -b` passes.
- The full `npx vitest run` from the repo root: 9985 passed, 2 failed. Three files failed, all in the baseline:
  - scripts/llm/call_log_report.test.mjs
  - scripts/llm/proof_rules.test.mjs
  - spacetimedb/src/helpers/measurement.results.test.ts
- No server change, no publish, no bindings, no prompt change.

## Self-Check: PASSED

- Files exist: src/map/graphLayout.ts, src/map/order.test.ts, src/map/useMapGraph.test.ts, src/map/MapSheet.vue, 51-UI-SPEC.md, 51-VALIDATION.md.
- Commits exist: 3105abe0, 83b5f1bd, 22dc4d92, 253e1adc, 68f64f71.
