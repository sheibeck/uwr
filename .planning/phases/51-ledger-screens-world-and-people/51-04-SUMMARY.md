---
phase: 51-ledger-screens-world-and-people
plan: 04
subsystem: ui
tags: [vue, map, graph-layout, deterministic, pure, tdd, client]
status: complete

requires:
  - phase: 51-ledger-screens-world-and-people
    provides: "51-02 map helpers (order, danger, terrain, travelTimer, route, regionChips, knownPlaces)"
provides:
  - "src/map/graphLayout.ts: deterministic layoutGraph, one pixel plane, border nodes, border box, gates"
  - "src/map/nodeView.ts: nodeViews, nodeAriaLabel, listRows, routePolylines, gateView"
affects: [51-08, 51-09, 51-11]

tech-stack:
  added: []
  patterns:
    - "Layout is one object read by both the SVG layer and the HTML nodes, so line endpoints equal node centres by construction"
    - "View models return plain strings only (text nodes and bound attributes); colours are danger.ts tokens"

key-files:
  created:
    - src/map/graphLayout.ts
    - src/map/graphLayout.test.ts
    - src/map/nodeView.ts
    - src/map/nodeView.test.ts
  modified: []

key-decisions:
  - "Border node primary neighbour is the region neighbour with the lowest (column, y, id); side and row follow it"
  - "A gate exists for every edge whose ends are in different regions, including an uncharted-typed one (the edge kind stays 'uncharted')"
  - "Outer columns use column -1 (left) and deepest + 1 (right) so keyboard Left/Right can walk through them"
  - "NodeView gained a steps field (number | null) so listRows and the aria-label share one source"
  - "Places that are neither visited nor in heardOf read 'heard of' (heardOf is accepted but not needed)"

requirements-completed: [LDG-04]

coverage:
  - id: D1
    description: "layoutGraph is deterministic, one coordinate plane, with border nodes, box, gates and 48 margin"
    requirement: "LDG-04"
    verification:
      - kind: unit
        ref: "src/map/graphLayout.test.ts (30 tests, including three-permutation determinism and endpoint equality)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Node views, aria-labels, list rows, route polylines and gate views carry the UI-SPEC states and copy"
    requirement: "LDG-04"
    verification:
      - kind: unit
        ref: "src/map/nodeView.test.ts (39 tests)"
        status: pass
    human_judgment: false

duration: ~25min
completed: 2026-10-07
---

# Phase 51 Plan 04: Deterministic route-graph layout and node view model Summary

Pure, tested route-graph layout (breadth-first columns from the bind-stone start, border nodes, border box, gates, one shifted pixel plane) plus the node, list-row, route and gate view models, so plan 51-08 only renders what these return.

## Commits (TDD)

| Gate | Commit | What |
|------|--------|------|
| RED (layout) | 53544361 | test: graphLayout.test.ts; run failed with the module missing (no tests ran) |
| GREEN (layout) | 01a0152a | feat: layoutGraph; 30 of 30 tests pass |
| REFACTOR (layout) | 0c214ebc | refactor: split into private steps with a header listing the UI-SPEC steps; 30 of 30 still pass |
| RED (views) | deb363ad | test: nodeView.test.ts; run failed with `Cannot find module './nodeView'` |
| GREEN (views) | e77b0e6b | feat: node, list, route and gate views; 39 of 39 tests pass |

No REFACTOR commit for nodeView.ts: nothing to clean up after GREEN.

## Verification

- `pnpm exec vitest run src/map`: 8 files (plus the two new ones), all pass; map guards (no Date.now, no replaceAll, no banned word) cover the new files.
- `npx vue-tsc -b`: exit 0.
- Full `npx vitest run` from the repo root: 296 files pass, 2 tests fail in the 3 baseline files only (scripts/llm/call_log_report.test.mjs, scripts/llm/proof_rules.test.mjs, spacetimedb/src/helpers/measurement.results.test.ts). Nothing new fails.
- Acceptance greps: `export function layoutGraph`, `COLUMN_PITCH = 192`, `export function nodeViews`, `listRows`, `routePolylines`, `gateView` each once; `no known path` present; `region travel locked for about` once (in a comment next to the template that uses `aboutMinutes`).

## What later plans need to know

Exports from `src/map/graphLayout.ts`: `layoutGraph({ regionId, places, edges })`, types `GraphLayout`, `LayoutNode`, `LayoutEdge`, `LayoutGate`, `LayoutPlace`, `LayoutInput`, and constants `COLUMN_PITCH` 192, `ROW_PITCH` 72, `PLANE_MARGIN` 48, `BORDER_INSET` 32, `BORDER_RIGHT` 176, `OUTER_GAP` 48, `LABEL_WIDTH` 144, `LABEL_HEIGHT` 36, `LABEL_OFFSET` 20, `GATE_WIDTH` 176, `GATE_HEIGHT` 24.

- `GraphLayout.nodes` is sorted by x, y, id. `LayoutNode.column` is -1 for the left outer column and deepest + 1 for the right one; `outer` is 'left' | 'right' | null; `labelSide` is 'left' for left-outer nodes only.
- Edges are `a` < `b` with key `${a}-${b}`, sorted; kinds 'in' | 'cross' | 'uncharted'. Edges between two border nodes are not returned. Gates are in edge order, one per edge whose ends are in different regions; `gate.nearId` is the shown-region node, `farId` the border node.
- `border` and `caption` are null only for an empty region (plane 96 x 96, `startId` null). The caption sits at border x + 16, y + 16. Every circle, 144 x 36 label box (right of the node from centre + 20, or ending at centre - 20 for left labels, top at centre - 10), 176 x 24 gate box and the border box is at least 48 inside `width` x `height`, touching 48 exactly on the left and top.
- Callers pass `LayoutPlace[]` = the drawn places (own region plus other-region known places) and `knownPlaces(...).edges`; places not connected to the shown region are ignored.

Exports from `src/map/nodeView.ts`:
- `NodePlace` (id, name, regionId, terrainType, isSafe, levelOffset, bindStone, craftingAvailable: a generated `Location` row fits), `NodeRegion` (id, name, dangerMultiplier), `NodeCircle`, `StateWord`.
- `nodeViews({ layout, places: Map<bigint, NodePlace>, regions, visited, heardOf, currentLocationId, selectedId, boundLocationId, playerLevel, steps })` returns `NodeView[]` in layout order, skipping nodes with no place row. `steps` is `stepsFrom(adjacencyOf(edges), currentLocationId)`; here always reads steps 0. Extra field `steps: number | null` on `NodeView` (not in the plan interface).
- `nodeAriaLabel(parts)`, `listRows({ views, adjacency, places, regions, shownRegionId })` (rows ordered x, y, id; crossings are relative to `shownRegionId`; unknown danger reads 'Danger unknown' in `levelText`), `routePolylines(layout, path)` (runs of two or more consecutive layout nodes), `gateView(gate, chip, regionName, timer, mobile)` (text is 'To {Region}' only on desktop while open; `levelText` is '' without a chip; the component joins ' · ' and the level).
- Level colours: band tokens from `BAND_COLOR`, safe `var(--color-con-light-green)`, unknown `var(--color-neutral-500)`.

## Deviations from Plan

None - plan executed as written. Choices the plan left open are recorded under key-decisions (border node primary neighbour, gates for uncharted-typed cross-region edges, outer column indexes, `steps` field).

## Known Stubs

None.

## Threat Flags

None. T-51-19 mitigated: views return plain strings for text nodes and attributes; a test feeds a name with an img onerror payload and checks it stays literal text, and a source test bans HTML construction and literal colours in nodeView.ts. T-51-20 accepted (linear-ish work on tens of places).

## Self-Check: PASSED

- src/map/graphLayout.ts, graphLayout.test.ts, nodeView.ts, nodeView.test.ts exist.
- Commits 53544361, 01a0152a, 0c214ebc, deb363ad, e77b0e6b exist in git log.
