---
phase: 51-ledger-screens-world-and-people
plan: 08
subsystem: ui
tags: [vue, map, svg, route-graph, keyboard, accessibility, list-view, legend, screen-args, client]
status: complete

requires:
  - phase: 51-ledger-screens-world-and-people
    provides: "51-04 layoutGraph, nodeViews, listRows, routePolylines, gateView; 51-02 regionChips, route helpers, terrain and danger tables; 51-07 MAP_KEY map hub"
provides:
  - "GraphPlane.vue: one pixel plane (svg border, edges, route; caption; node buttons and labels; gate pills) with a roving-tabindex keyboard"
  - "GraphList.vue: the List view, the complete keyboard and screen-reader equivalent of the graph"
  - "MapLegend.vue: the legend row (Places, Terrain with Swamp, Danger vs Lv {n}, Marks)"
  - "src/map/MapScreen.vue: the desktop Map body (legend, canvas, Graph | List switch, Center on you, screen-argument rules, selection and focus redraw rules)"
  - "ScreenArgs.locationId and ScreenArgs.regionId; AppFrame keeps args for 'map' as for 'vendor'"
  - "Registry move: screens.ts registers src/map/MapScreen.vue; src/screens/MapScreen.vue deleted"
affects: [51-09, 51-10, 51-11]

tech-stack:
  added: []
  patterns:
    - "Ring and level colours by scoped band classes (band-easy, lv-deadly ...) mapped to tokens in CSS, because the token guards pin inline custom-property keys and forbid component-local custom properties"
    - "Overlays (view switch, Center on you) sit over a canvas whose scroller is the SegTabs panel, so they never scroll with the plane"
    - "Pre-flush watch on the drawn place set checks document.activeElement before the redraw removes the node"

key-files:
  created:
    - src/map/GraphPlane.vue
    - src/map/GraphPlane.test.ts
    - src/map/GraphList.vue
    - src/map/GraphList.test.ts
    - src/map/MapLegend.vue
    - src/map/MapLegend.test.ts
    - src/map/MapScreen.vue
    - src/map/MapScreen.test.ts
    - src/map/passageRedraw.test.ts
  modified:
    - src/screens/screens.ts
    - src/screens/screens.test.ts
    - src/game/context.ts
    - src/frame/AppFrame.vue
    - src/frame/frameControls.test.ts
    - src/frame/AppFrame.screens.test.ts
  deleted:
    - src/screens/MapScreen.vue

key-decisions:
  - "The canvas is a non-scrolling positioned box; the scroller is the SegTabs tabpanel inside it (overflow auto), so the Graph | List switch and Center on you stay fixed at the corners"
  - "Band colours (rings, list levels) are scoped classes, not inline custom properties; the level text inside labels and gate pills uses an inline color from the view's var(--color-...) string"
  - "A gate pill is centred with translate(-50%, -50%) and sized to its text (max 176px) instead of a fixed 176px box; the region name ellipsizes at 144px"
  - "The selected-place-disappears rule only acts when your own place is drawn; while the location data is still arriving the selection is kept"
  - "Legend row horizontal padding is 0: the drawer body already pads 24px on the sides"
  - "Safe nodes show the shield and no 'Safe' text in the label sub-line (UI-SPEC: nothing for safe places); the node aria-label and the List view carry the word"

patterns-established:
  - "Tab-order contract: one graph tab stop (focused, else selected, else your place, else start), gates after the group in DOM order"
  - "data-node-id on the node button and its label, data-gate-key on gate pills (used by tests and the focus rule)"

requirements-completed: [LDG-04]

duration: 45min
completed: 2026-10-07
---

# Phase 51 Plan 08: Map graph surface Summary

**The desktop Map now draws the shown region as a one-plane svg route graph with border, crossings (gate pills), route and a roving-keyboard model, with a List equivalent, a legend row, and `openScreen('map', { locationId | regionId })` argument handling.**

## Performance

- **Duration:** about 45 min
- **Completed:** 2026-10-07
- **Tasks:** 3 of 3 (TDD: a failing-test commit before each feature commit)
- **Files:** 9 created, 6 modified, 1 deleted

## Accomplishments

- **GraphPlane.vue** (props `layout, views, gates, routes, regionName, selectedId, currentId, mobile`; emits `select(id)`; exposes `focusCurrent()` and `scrollToNode(id, block = 'center')`). The plane is a `div.graph-plane` at the layout's pixel size holding, in order: one `svg` (rect.border rx 24, line.edge with `cross` or `uncharted`, polyline.route; width, height and viewBox equal to the plane, no preserveAspectRatio, aria-hidden), the aria-hidden caption, the `role="group"` node layer (`{Region} route graph`), then the gate pills. Node buttons are centred on the view point (hit 32, 44 mobile) with a 32 or 24px circle and a 16 or 12px terrain icon; labels are siblings (name with title, bind and crafting marks, sub-line with the level in its band colour). Roving tabindex: focused, else selected, else your place, else the start. Arrows move within a column or to the nearest-row node of the previous or next column (outer columns included), Home goes to your place or the start, End to the last node, Enter and Space select. Gate pills show `To {Region} · {Lv a–b}` (level in band colour) or, while the timer runs, a lock and `{Region} · {m:ss}` (time aria-hidden), stay operable, and select the far node; the pill whose far node is selected carries the accent ring and glow.
- **GraphList.vue**: `ul` of buttons in layout order (name with title, state word, level and band word in colour, steps, `Connects to ...` sub-line), selected row `aria-pressed` with the List selected state, 32px rows (44 under 899px).
- **MapLegend.vue**: four groups and three 1px x 12px dividers; `Danger vs Lv {n}:` reads the character level.
- **MapScreen.vue** (desktop): legend row then canvas (min-height 320, radius md, tokens-only radial glow) with the SegTabs `Map view` switch top-right and Center on you bottom-right. Arguments apply once the hub is ready: `locationId` selects that drawn place and shows its region; `regionId` shows that region and selects its start node (your place when you stand in it); anything unknown or undrawn falls back to your place and region (T-51-33). Arguments arriving while the Map is open are applied too. The selected node is scrolled into view once on open; the selection is cleared on unmount. When the selected place disappears the selection moves to your place and focus that was on the removed node goes to the group's current node.
- **States**: nothing renders until visited, connections and cooldowns have applied; no character location (or no character) shows EmptyState `No places discovered yet.` / `Travel to a new place and it appears here.`; mobile keeps the Here view (`ContextContent`) until plan 51-11.
- **Frame and registry**: `ScreenArgs` gains `locationId` and `regionId`; AppFrame keeps args for `'vendor'` and `'map'` (sync watch and `openScreen`); `screens.ts` imports `../map/MapScreen.vue`; the old `src/screens/MapScreen.vue` is deleted.

## Task Commits

1. Task 1 RED: `831c4dec` test(51-08) GraphPlane tests; GREEN: `642a5797` GraphPlane
2. Task 2 RED: `bc1a41e5` test(51-08) GraphList and MapLegend tests; GREEN: `6ccb8180` GraphList and MapLegend
3. Task 3 RED: `fe03f366` test(51-08) MapScreen and passage redraw tests; GREEN: `4709f3e9` Map screen body, screen arguments and registry move
4. `02d25290` docs(51-08) comment tweak so `grep -c "route graph"` on GraphPlane.vue prints 1

## Verification

- New tests: GraphPlane 33, GraphList 9, MapLegend 8, MapScreen 29, passageRedraw 6 (all pass).
- `npx vue-tsc -b`: clean.
- Full `npx vitest run` from the repo root: 9494 passed, 2 failed, 3 test files failed to load; all of those are the baseline items (scripts/llm/call_log_report.test.mjs, scripts/llm/proof_rules.test.mjs, spacetimedb/src/helpers/measurement.results.test.ts).
- styles guards (designContract, colors, tokens, frameContract) and `mapGuards` pass with the new files.
- Acceptance greps: `<svg` 1, `viewBox` 1, `non-scaling-stroke` 3, `route graph` 1, `Danger vs Lv` 1, `Region entrance` 1, `aria-pressed` in GraphList 1, old MapScreen deleted, screens.ts import 1, `locationId?: bigint` 1, `regionId?: bigint` 1, `'map'` in AppFrame.vue 2, empty-state body 1.
- No publish, no bindings change (client only).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Token guards reject inline custom properties and component-local custom properties**
- **Found during:** Task 1 design (tokens.client.test.ts pins inline `--x` keys to `--bag-columns` and requires every `var(--x)` to be a Nocturne or client token)
- **Issue:** The natural `--ring` custom property for band colours is forbidden.
- **Fix:** Rings and list levels use scoped band classes (`band-safe|easy|even|tough|deadly|unknown`, `lv-*`) mapped to tokens; inline `color` carries the view's `var(--color-con-...)` string for text.
- **Files modified:** src/map/GraphPlane.vue, src/map/GraphList.vue
- **Commit:** 642a5797, 6ccb8180

**2. [Rule 1 - Bug] The plan's "canvas overflow auto holding the controls" would scroll the overlays away**
- **Found during:** Task 3
- **Issue:** Absolute controls inside a scrolling box scroll with the content.
- **Fix:** `.canvas` is `position: relative; overflow: hidden`; the SegTabs tabpanel is the scroller (`overflow: auto`), and the tablist and Center on you are positioned over it. Side effect: the panel is itself a focusable scroll region (one extra tab stop before the graph group).
- **Files modified:** src/map/MapScreen.vue
- **Commit:** 4709f3e9

**3. [Rule 3 - Blocking] AppFrame.screens.test fake locations lacked terrainType, bindStone and craftingAvailable**
- **Found during:** Task 3 (the real Map renders the fake rows through terrainOf)
- **Fix:** the fake game's two locations gained the three fields; the Map drawer test provides a ready map hub (the old "empty-state with a provided game" test was split into a Map-drawer test and a not-ready test, Social copy unchanged).
- **Files modified:** src/frame/AppFrame.screens.test.ts
- **Commit:** 4709f3e9

### Choices within the plan's latitude (not rule deviations)

- `scrollToNode(id, block = 'center')` takes an optional second argument (the interface lists `scrollToNode(id)`); MapScreen's Center on you and open-scroll call it with one argument.
- Legend padding is `0 0 8px` (the drawer body already pads 24px on the sides); the UI-SPEC table's `0 24px 8px` would double the inset.
- Gate pills are centred with `transform: translate(-50%, -50%)` and sized to their content (max 176px) rather than a fixed 176px box.

## Authentication Gates

None.

## Known Stubs

None. The Map has no detail column, header chips or travel pill yet by plan (51-09), and mobile still renders the Here view (51-11).

## Threat Flags

None. The svg lives only in `src/map/GraphPlane.vue`; all server strings are text nodes or bound attributes (escape tests in GraphPlane, GraphList and MapScreen render an img onerror name as text); screen arguments only select among drawn places and known regions.

## For later Phase 51 plans

- **51-09 (detail column, chips, pill):** `src/map/MapScreen.vue` desktop body is `.map-screen` (flex column) holding `<MapLegend>` then `.canvas`; wrap those two in the grid column and add the detail column beside. State comes from `MAP_KEY` (`selectedId`, `shownRegionId`, `select`, `showRegion`, `view`, `banner`). `layoutFor(regionId)` and `applyArgs` live inside MapScreen's setup; chips should reuse the same rule (show region, select its start node or your place) and call the exposed `plane.focusCurrent()` afterwards. Gate pills and list rows only call `map.select(id)`; they never call `move_character`. Computed `views`, `rows`, `routes`, `chips`, `gates` in MapScreen are the single place those are built.
- **GraphPlane hooks:** `data-node-id` on node buttons and labels, `data-gate-key` on gate pills, classes `node`, `label`, `gate`, `locked`, `selected`; `focusCurrent()` focuses the roving stop after the next redraw; `scrollToNode(id, 'center' | 'nearest')`.
- **51-11 (mobile):** GraphPlane and MapLegend already take `mobile` (44px hit boxes, region-name-only gate pills with a 44px `::after` slop, no level on mobile pills); MapScreen's mobile branch is still the old `.map-sheet` with `ContextContent` and does not apply args or select anything.
- **Frame:** `FrameControls.screenArgs` now carries `locationId` and `regionId` for the open Map; other screens clear it synchronously.
- **Tests that mount the real Map** need a ready `MAP_KEY` fake and a character with a `locationId`; a bare frame shows the empty state, a provided character without a ready hub renders an empty root.

## Self-Check: PASSED

- Created files present: src/map/GraphPlane.vue, GraphPlane.test.ts, GraphList.vue, GraphList.test.ts, MapLegend.vue, MapLegend.test.ts, MapScreen.vue, MapScreen.test.ts, passageRedraw.test.ts; src/screens/MapScreen.vue deleted.
- Commits found: 831c4dec, 642a5797, bc1a41e5, 6ccb8180, fe03f366, 4709f3e9, 02d25290.
