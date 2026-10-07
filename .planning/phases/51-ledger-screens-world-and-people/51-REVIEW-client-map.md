---
phase: 51-ledger-screens-world-and-people
reviewed: 2026-10-07T00:00:00Z
depth: deep
scope: "git diff 3ecb1520..HEAD -- src/map (client Map and Travel)"
files_reviewed: 57
files_reviewed_list:
  - src/map/DetailPanel.test.ts
  - src/map/DetailPanel.vue
  - src/map/GraphList.test.ts
  - src/map/GraphList.vue
  - src/map/GraphPlane.test.ts
  - src/map/GraphPlane.vue
  - src/map/MapActions.vue
  - src/map/MapDock.test.ts
  - src/map/MapDock.vue
  - src/map/MapLegend.test.ts
  - src/map/MapLegend.vue
  - src/map/MapMeta.test.ts
  - src/map/MapMeta.vue
  - src/map/MapScreen.test.ts
  - src/map/MapScreen.vue
  - src/map/MapSheet.test.ts
  - src/map/MapSheet.vue
  - src/map/RegionsListbox.test.ts
  - src/map/RegionsListbox.vue
  - src/map/TravelPill.test.ts
  - src/map/TravelPill.vue
  - src/map/arrival.test.ts
  - src/map/danger.test.ts
  - src/map/danger.ts
  - src/map/detailModel.test.ts
  - src/map/detailModel.ts
  - src/map/graphLayout.test.ts
  - src/map/graphLayout.ts
  - src/map/knownPlaces.test.ts
  - src/map/knownPlaces.ts
  - src/map/mapContext.ts
  - src/map/mapData.test.ts
  - src/map/mapData.ts
  - src/map/mapGuards.test.ts
  - src/map/mapHeader.test.ts
  - src/map/mobileTargets.test.ts
  - src/map/nodeView.test.ts
  - src/map/nodeView.ts
  - src/map/order.ts
  - src/map/passageRedraw.test.ts
  - src/map/queries.test.ts
  - src/map/queries.ts
  - src/map/regionChips.test.ts
  - src/map/regionChips.ts
  - src/map/route.test.ts
  - src/map/route.ts
  - src/map/secondsTick.test.ts
  - src/map/secondsTick.ts
  - src/map/terrain.test.ts
  - src/map/terrain.ts
  - src/map/travelChecks.test.ts
  - src/map/travelChecks.ts
  - src/map/travelTimer.test.ts
  - src/map/travelTimer.ts
  - src/map/useDestination.test.ts
  - src/map/useDestination.ts
  - src/map/useMapGraph.ts
findings:
  critical: 1
  warning: 5
  info: 8
  total: 14
status: issues_found
---

# Phase 51: Code Review Report (client Map, `src/map`)

**Reviewed:** 2026-10-07
**Depth:** deep (cross-checked against `spacetimedb/src/helpers/travel.ts` `performTravel`, `data/travel_config.ts`, `views/visited.ts`, `views/effects.ts`, `helpers/world_gen.ts`, `src/game/keyedBinding.ts`, `src/net/bindTable.ts`, `src/ledger/actionRunner.ts`, `src/session/useSession.ts`, `src/frame/Sheet.vue` / `Drawer.vue`)
**Files Reviewed:** 57
**Status:** issues_found

## Summary

The pure helpers are in good shape. `travelTimer` reads only `readyAtMicros` minus the server clock and never touches the cooldown length. `travelChecks` matches `performTravel`: followers count only when you lead, they must stand at the origin and not at the destination, it uses the shared `travelStaminaCost` and `travelEffectDiscount`, and party effects arrive through `my_character_effects`. Far places only select their first stop, and `useDestination.travel()` re-checks adjacency, `disabled`, pending and online before it calls `moveCharacter({ characterId, locationId })` with object syntax. The seconds tick and every keyed binding live in the hub's effect scope and are released on dispose. `onBeforeUnmount` drops the selected-place subscriptions. The design guards are clean in every production file: no `v-html`, no literal colours, sizes 10/12/14/20, weights 400/500, on-scale spacing, no `replaceAll` / `.at(` / `Object.hasOwn`, and no banned word. SVG appears only in `GraphPlane.vue`.

The problems are in the layout geometry, the hub-owned UI state, and the loading and accessibility details:

- On every horizontal border crossing, the gate pill sits on top of both node circles. This happens to the first border node on each side of every region.
- The arrival banner lives in the session hub and is never cleared when the Map closes. Reopening the Map shows an old "Arrived at …" line.
- Each time you select a place, Services and Players read `None` until that place's subscription applies.
- The whole graph is laid out again every time the character row changes, for example on the 8-second regen tick.

## Critical Issues

### CR-01: Gate pills cover the node circles on both sides of a border crossing (pointer selection blocked)

**File:** `src/map/graphLayout.ts:349`, `:359`, `:396-404`, `:205-210`; `src/map/GraphPlane.vue:298-320`, `:604-623`, `:663-667`

**Issue:** The layout puts the region border box 32px outside the outermost node centres (`border.x = minX - BORDER_INSET`). It puts outer border nodes 48px beyond the box (`x = border.x - OUTER_GAP`, or `border.x + border.w + OUTER_GAP`). Each gate is centred where its edge meets the box side (`x = border.x` or `border.x + border.w`). `freeY` first tries the neighbour's own row, so the first border node on each side always gets a horizontal edge, and its gate `y` equals both node centres' `y`.

`GraphPlane` draws the pill with `transform: translate(-50%, -50%)` and sizes it to its content: 8px padding on each side, a 12px icon, a 4px gap, and text such as `To Saltmarsh · Lv 4–7`, which comes to about 130–150px. The gates are rendered after `.node-layer` with no z-index, so they paint on top of the nodes and take the pointer events.

Failure scenario, left side:
- The near (start-column) node's centre is at `border.x + 32`, so its 24px circle spans `+20..+44`.
- The far node's circle spans `-60..-36`.
- A pill with any text has a half-width of at least about 25px. The usual `To {Region} · Lv a–b` pill has a half-width of about 70px, so it covers both circles and the first part of the near node's label.
- Clicking a node that is visible under the pill selects the far node through the gate instead.

On the right side, the pill (`border.x + border.w ± 70`) covers the far node circle (`+36..+60`) and the end of the deepest column's labels (which reach `maxX + 164`).

On mobile, `.gate.mobile::after { inset: -10px 0 }` makes the pill's hit area 44px tall, so it also swallows the 44px node hit boxes vertically.

`graphLayout.test.ts` counts the 176px gate boxes in the plane size but never checks that a gate stays clear of a node or label. The 51-08 and 51-11 summaries defer "M9 gate pills … no overlap" to visual UAT, but the overlap follows from the constants alone.

**Fix:** Give the gate its own room. Two ways:

1. Push outer nodes beyond the pill: `OUTER_GAP >= GATE_WIDTH / 2 + NODE_RADIUS + 8` (for example 112). Push the near column away from the box side: `BORDER_INSET >= GATE_WIDTH / 2 + NODE_RADIUS` on the gate side. Shrink `GATE_WIDTH` (and the CSS `max-width`) to keep the plane compact.
2. Or place the pill above or below the edge instead of on it:

```ts
// graphLayout.ts edgesAndGates: lift the pill off the line when the edge is near-horizontal
const lift = Math.abs(far.y - near.y) < GATE_HEIGHT ? -(GATE_HEIGHT / 2 + NODE_RADIUS + 4) : 0;
gates.push({ ..., x, y: near.y + t * (far.y - near.y) + lift, side });
```

Then add a layout test asserting that no gate box intersects any node box or label box (`nodeBoxes`), including mobile hit boxes (44px) and the 44px gate slop.

## Warnings

### WR-01: The arrival banner survives closing the Map and shows a stale "Arrived at …" when it reopens

**File:** `src/map/mapData.ts:81`, `:259-264`; `src/map/MapScreen.vue:96-114`, `:167-169`, `:200-213`

**Issue:** `banner` is session-hub state. Only `reset()` clears it, and that runs on logout. `onBeforeUnmount` clears the selection but not the banner. On reopen, `applyArgs` calls `map.select` / `map.showRegion` directly, and the `shownId` watcher returns before its `setBanner(null)` because the selection is already in the region. The arrival watcher runs only while the Map is mounted.

Scenario:
1. Travel from the Map. The banner reads `Arrived at Gloamwood.`
2. Close the Map.
3. Walk two more stops from the rail or by typing `go`.
4. Reopen the Map. The banner (a `role="status"` region) still says `Arrived at Gloamwood.` while you stand somewhere else.

The banner also survives a character switch, because `reset()` is not called then.

**Fix:** End the banner whenever the Map unmounts or applies its arguments:

```ts
onBeforeUnmount(() => {
  map.select(null);
  map.setBanner(null);
});
// and in applyArgs(), before selecting:
map.setBanner(null);
```

Add an arrival test: travel, unmount, change `locationId`, remount, and expect no `.arrival-banner`.

### WR-02: Services and Players read "None" for every newly selected place until its subscription applies

**File:** `src/map/mapData.ts:149-162`, `:224-229`; `src/map/useDestination.ts:94-117`; `src/map/detailModel.ts:431-444`; `src/map/DetailPanel.vue:161-171`; `src/map/MapDock.vue:193-203`

**Issue:** The `npc` and `character` selected-place bindings use `swap: 'immediate'`. `setCurrent` disposes the old binding, which clears its rows. The new binding's rows stay `[]` until `onApplied`, even when the SDK cache already holds them, because `bindTable.refresh` runs only on apply or on row events. Every click on a visited place therefore briefly states `Services: None` and `Players: None`, then flips to `Vendor` / `2`. A slow link stretches this out. The hub exposes `selectedApplied` for exactly this case, but nothing reads it (grep: no consumer outside `mapData` / `mapContext`).

This breaks the UI-SPEC loading rule ("Nothing renders until … apply; no placeholder") with a false value, not an empty one.

**Fix:** Pass `selectedApplied` into `buildDetail` and render a neutral value while it is false. Do not show `None`:

```ts
// useDestination.ts
selectedApplied: map.selectedApplied.value,
// detailModel.ts servicesFor / playersFor
if (!input.selectedApplied) return { items: [], text: '…' }; // or omit the rows until applied
```

Note that `selectedApplied` is false when `selectedId` is null, so the "selected is null → your place" fallback must handle that case.

### WR-03: The whole graph is laid out again on every character row update (the regen tick), and twice on mobile

**File:** `src/map/mapData.ts:177-186`; `src/map/useMapGraph.ts:378-474`; `src/map/MapSheet.vue:27`; `src/map/MapScreen.vue:69`; `src/map/MapMeta.vue:26-47`

**Issue:** `known` reads `input.character.value?.locationId` inside its computed, so it depends on the whole character row. The server rewrites that row on every regen tick (`REGEN_TICK_MICROS = 8_000_000n`), on effect ticks, and on stamina, XP and HP changes. Each time, `known` returns a new object, and that triggers the whole chain:
- `adjacency`, `steps` (BFS from you), `layoutGraph`, `nodeViews`, `listRows` and `chips`;
- the `drawnIds` watcher;
- the GraphPlane re-render.

On mobile, `MapScreen` and `MapSheet` each call `useMapGraph`, and both read `layout`, so the layout runs twice per change. `MapMeta` builds a third set of chips on its own. None of this depends on the 1-second tick, but this per-row cascade is what the brief asked about.

**Fix:** Depend on the primitive only:

```ts
// mapData.ts
const currentLocationId = computed<bigint | null>(() => {
  const here = input.character.value?.locationId ?? 0n;
  return here === 0n ? null : here;
});
const known = computed(() => knownPlaces<Location>({ ..., currentLocationId: currentLocationId.value, ... }));
```

Also call `useMapGraph` once, in `MapScreen`, and pass it to `MapSheet` (and to `MapMeta` through provide or inject), so mobile does not compute a second layout.

### WR-04: Screen readers hear "Region travel: left" and "Blocked · left" while a timer runs

**File:** `src/map/TravelPill.vue:40-41` (the `Region travel: <clock aria-hidden> left` template); `src/map/DetailPanel.vue:154-156`; `src/map/MapDock.vue:147-149`

**Issue:** The clock is `aria-hidden`, but the text after it (` left`) is not. The accessible text becomes `Region travel:  left` followed by the `.sr-only` sentence `Region travel ready in about 3 minutes`. The trip row reads `Blocked ·  left Region travel ready in about 3 minutes`. The checklist rows avoid this because their sr text replaces the clock in place (`Ready in about 4 minutes.`), but the pill and the trip row do not.

**Fix:** Hide the whole visible phrase, not only the clock, and give one sr sentence:

```vue
<span aria-hidden="true">Region travel: {{ clock }} left</span>
<span class="sr-only">{{ minutes }}</span>
```

For the trip row, wrap `parts.before + clock + parts.after` in one `aria-hidden` span next to `srText`. Add an accessible-text assertion (text with `[aria-hidden]` nodes removed) to `TravelPill.test.ts` and `DetailPanel.test.ts`.

### WR-05: Choosing a region chip does not move focus into the graph or scroll when the selection is already in that region

**File:** `src/map/MapScreen.vue:200-213`

**Issue:** The `shownId` watcher returns early when the selected place already belongs to the newly shown region. That skips `scrollSelectedIntoView()` and the `focusCurrent()` move from a chip.

Scenario: on region A, choose the gate to Saltmarsh, which selects the border node of region B. Then click the `Saltmarsh` chip. The graph switches to B, but focus stays on the chip and the selected node may be off-canvas. The UI-SPEC says choosing a chip moves focus to the graph group (Accessibility "Region chip chosen → the graph group").

Clicking the chip of the region already shown does nothing at all (`shownId` does not change).

**Fix:** Handle focus and scroll before the early return:

```ts
watch(shownId, (region) => {
  if (region === null) return;
  const fromChip = document.activeElement instanceof HTMLElement && document.activeElement.hasAttribute('data-region-chip');
  const selected = map.selectedId.value;
  if (!(selected !== null && placeById.value.get(selected)?.regionId === region)) {
    /* pick start/here as today */
  }
  scrollSelectedIntoView();
  if (fromChip) surface()?.focusCurrent();
});
```

Also let a click on the already-shown chip call `surface()?.focusCurrent()`.

## Info

### IN-01: MapMeta re-implements the shown-region and chip rules that useMapGraph owns

**File:** `src/map/MapMeta.vue:26-47`, `src/map/useMapGraph.ts:382-391`, `:457-465`
**Issue:** 51-11 created `useMapGraph` so that the two layouts "can never disagree", but MapMeta keeps its own copies of `currentRegionId`, `shownId` and `chips`. A future change to either copy can make the header chips and the graph disagree about which region is shown.
**Fix:** Have MapMeta read the shared `MapGraph` (provide it from MapScreen) instead of rebuilding it.

### IN-02: DetailPanel `travelled` emit has no listener and fires even when the server refuses

**File:** `src/map/DetailPanel.vue:32`, `:107`
**Issue:** No parent listens for `@travelled`. The event also fires whenever the reducer promise resolves, and `performTravel` refusals resolve normally.
**Fix:** Remove the emit, or rename it to something like `sent`.

### IN-03: `aria-pressed` is present only on the selected node or row

**File:** `src/map/GraphPlane.vue:245`, `src/map/GraphList.vue:24`
**Issue:** The binding is `'true'` or `undefined`, so only one button is exposed as a toggle. All the others are plain buttons, which gives inconsistent screen-reader semantics.
**Fix:** Bind `'true'` / `'false'`, or switch to `aria-current="true"` for the selection.

### IN-04: The Details toggle's `aria-controls` points at an element that does not exist while collapsed

**File:** `src/map/MapDock.vue:184`, `:190`
**Issue:** The details body is `v-if`, so the id named in `aria-controls` is missing from the DOM while the toggle is closed.
**Fix:** Use `v-show`, or bind `aria-controls` only while `detailsOpen` is true.

### IN-05: mobileTargets assertions that cannot fail, and a dead mobile chip rule

**File:** `src/map/mobileTargets.test.ts:88`, `:31-39`; `src/map/MapMeta.vue:173-183`
**Issue:**
- `expect(24 + 2 * 10).toBeGreaterThanOrEqual(44)` compares two constants, so it can never fail.
- `sizeOf` takes the maximum over desktop and mobile rules, so a desktop size can satisfy a mobile requirement.
- MapMeta renders its chips only when `frame.isDesktop`, so `@media (max-width: 899px) .region-chip::after` never applies. The test still lists it as a mobile target.
**Fix:**
- Parse the inset from the source and compute the slop from it.
- Scope `sizeOf` to the `max-width: 899px` block, or to `.mobile` selectors.
- Drop the dead rule and its target row.

### IN-06: Layout order depends on the runtime locale

**File:** `src/map/order.ts:10-12`
**Issue:** `localeCompare(b, undefined, …)` sorts by the browser's locale. Two players with different locales, for example sv and en, can get different row orders for the same region. The layout is deterministic on one machine only.
**Fix:** Pass a fixed locale (`'en'`) if the layout should be identical for every player.

### IN-07: Gate pills tab in edge-id order, not layout order

**File:** `src/map/graphLayout.ts:378-407`, `src/map/GraphPlane.vue:298-320`
**Issue:** The gates are emitted in edge order, sorted by `(a, b)` ids, and rendered in that order. The UI-SPEC asks for "separate tab stops after the group, in layout order".
**Fix:** Sort the gates by `(side, y, key)` before returning them from `layoutGraph`.

### IN-08: Arrival moves focus on any location change, including when focus is outside the Map

**File:** `src/map/MapScreen.vue:178-195`
**Issue:** A follower moved by their leader, or a respawn, pulls focus to the detail `h4` or the dock name. This happens even when the user is working in the still-operable left vitals rail.
**Fix:** Move focus only when `document.activeElement` is inside the Map root, or when the trip started from this screen (the runner was pending).

---

_Reviewed: 2026-10-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
