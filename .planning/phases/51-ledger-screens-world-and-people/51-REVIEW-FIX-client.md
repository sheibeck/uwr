---
phase: 51-ledger-screens-world-and-people
fixed_at: 2026-10-07T12:30:00Z
review_path:
  - .planning/phases/51-ledger-screens-world-and-people/51-REVIEW-client-map.md
  - .planning/phases/51-ledger-screens-world-and-people/51-REVIEW-client-rest.md
iteration: 1
findings_in_scope: 29
fixed: 24
deferred: 4
decided_elsewhere: 1
status: all_fixed
---

# Phase 51: Code Review Fix Report (client)

**Fixed at:** 2026-10-07
**Source reviews:** `51-REVIEW-client-map.md` (CR-01, WR-01 to WR-05, IN-01 to IN-08) and `51-REVIEW-client-rest.md` (WR-01 to WR-06, IN-01 to IN-09).
**Iteration:** 1

**Summary:**
- Findings in scope: 29 (14 client-map and 15 client-rest).
- Fixed: 24, with one commit per finding (24 commits).
- Deferred to plan 51-12, which rewrites the layout: client-map CR-01, the layout part of WR-03, IN-06 and IN-07.
- Decided elsewhere: client-rest IN-09 (server side, kept and documented in `2332df38`).
- The server part of client-rest WR-06 was already fixed (`716d0741`). This pass fixes only its client part.

I worked in the main tree and committed explicit paths only, as the coordinator asked. I did not use the fixer's worktree flow. I did not touch `spacetimedb/`, `src/module_bindings/`, `src/map/graphLayout.ts` or `src/map/order.ts`. Nothing was published.

## Fixed: client-map

### WR-01: The arrival banner survived closing the Map
**Commit:** `dc1c8ad9`. **Files:** `src/map/MapScreen.vue`, `src/map/arrival.test.ts`
The hub banner is cleared in two places: on unmount, and in `applyArgs` (every open, or a new argument).
**Tests:**
- Travel, unmount, move, remount: no banner.
- A banner left in the hub before the Map opens is cleared on open.

### WR-02: Services and Players read "None" until the selected place applied
**Commit:** `ff9a3d5b`. **Files:** `detailModel.ts`, `useDestination.ts`, `DetailPanel.vue`, `MapDock.vue`, plus tests (`detailModel`, `DetailPanel`, `MapDock`, `MapSheet`)
- `BuildDetailInput.peopleApplied` is required. `useDestination` passes `map.selectedApplied`.
- `trip.services` and `trip.players` are `null` until the subscriptions apply. They count only when the shown place is the selected place, never for the fallback to your place.
- The components leave out the rows, and the `dl` when it is empty. This follows the UI-SPEC rule "no placeholder".
- A heard-of place keeps "Unknown until you visit", which needs no subscription.

### WR-04: Screen readers heard "Region travel: left" and "Blocked · left"
**Commit:** `34f97e7f`. **Files:** `TravelPill.vue`, `DetailPanel.vue`, `MapDock.vue`, plus tests
- While a timer runs, the whole visible phrase is `aria-hidden` and only the `.sr-only` minute sentence is read.
- DetailPanel and MapDock no longer split the trip text around the clock.
- The tests assert the spoken text: the element's text with its `[aria-hidden]` subtrees removed.

### WR-05: A region chip did not move focus when the selection was already in that region
**Commit:** `0e20d15a`. **Files:** `mapContext.ts`, `mapData.ts`, `MapMeta.vue`, `MapScreen.vue`, plus tests
- The hub gains `chooseRegion(id)` and a `regionChosen` counter. MapMeta chips call `chooseRegion`.
- MapScreen's `shownId` watcher now picks only the selection.
- A new watcher on `regionChosen` scrolls the selection into view and calls `focusCurrent()` on every chip choice. That covers the region that already held the selection and the region already shown.
- The old `data-region-chip` activeElement check is gone. The attribute stays on the chips.

### IN-01: MapMeta duplicated the useMapGraph rules
**Commit:** `019a7f43`. **Files:** `useMapGraph.ts`, `MapMeta.vue`, `MapMeta.test.ts`
- New export `useShownRegion()` holds `currentId`, `playerLevel`, `placeById`, `drawnIds`, `currentRegionId`, `shownId` and `chips`.
- `useMapGraph` builds on it (`MapGraph extends ShownRegion`), and MapMeta reads it.
- MapMeta is rendered by the frame header, outside MapScreen, so a provide from MapScreen cannot reach it. It shares the rules, not the MapGraph object, and lays out no graph.
- A source test pins one copy of `regionChips(` and `knownRegionIds.includes`.

### IN-02: The DetailPanel `travelled` emit
**Commit:** `60cff587`. Removed the emit, which had no listener and fired on refusals too.

### IN-03: `aria-pressed` was present only on the selected node or row
**Commit:** `9ba6b084`. Unselected nodes and rows now have `aria-pressed="false"` (`GraphPlane.vue` nodes, `GraphList.vue` rows).

### IN-04: The Details toggle pointed `aria-controls` at a missing id
**Commit:** `432d2188`. `aria-controls` is bound only while the details are open (`MapDock.vue`).

### IN-05: mobileTargets checks that could not fail, and a dead chip rule
**Commit:** `95dc2ac8`. **Files:** `mobileTargets.test.ts`, `MapMeta.vue`, `MapMeta.test.ts`
- The gate slop is computed from GraphPlane's `.gate` height and the `-Npx` inset of `.gate.mobile::after`.
- `mobileSizeOf` replaces `sizeOf`. It judges `@media` width conditions at 390px and takes the last declaration that applies (the cascade), so a desktop-only rule cannot satisfy a mobile target. A fixture test covers it.
- The parser no longer glues the `<style scoped>` tag text onto the first selector. That was a latent bug.
- MapMeta's never-applied `max-width: 899px .region-chip::after` rule is removed, along with its target row and the now-unused `position: relative`. A test pins that chips render only in the desktop branch.

### IN-08: An arrival pulled focus into the Map from elsewhere
**Commit:** `020b9d15`. **Files:** `useDestination.ts`, `MapScreen.vue`, `arrival.test.ts`, `useDestination.test.ts`
- Focus moves only in two cases:
  - focus is inside the Map: its root, or the `[role="dialog"]` drawer or sheet around it;
  - the arrival is where the Map's own Travel sent the character.
- `Destination.isOwnArrival(id)` answers once. `travel()` sets the mark, and any arrival or a rejected send clears it.
- The selection, region switch and banner still follow every arrival.

## Fixed: client-rest

### WR-01: A rejected Bind was silent
**Commit:** `f3880f30`. NearbyList watches `runner.rejection` and appends `Couldn't send that. Try again.` as a local `system` feed line. The rail's results go to the feed.

### WR-02: The focus-after-Bind flag could go stale
**Commit:** `04f7aaed`
- Bind records the place it was sent for. Focus moves to the bind stone eye only when the row says bound there while the character still stands there.
- The mark clears on a move, a rejection, 2 seconds after a resolve without the row changing (a `fail()` refusal), and on unmount.

### WR-03: The mobile exit chips dropped focus to the body after a trip
**Commit:** `4f504b6c`
- The place-change watch runs with `flush: 'pre'`. When focus was inside the strip or card, it moves after the update to the first chip of the new place.
- When the new place has no exits, focus moves to the strip root, which is now `tabindex="-1"`.
- Focus elsewhere is left alone.

### WR-04: The travel pending guard was per instance
**Commit:** `4aa4f68f`
- New `src/map/tripGuard.ts` exports `createTripGuard` and `TRIP_LAPSE_MS = 2000`. No existing file name differs from it only in case.
- The hub exposes `travelPending`, `beginTrip()` and `endTrip()`. It ends the trip when the character's place or the character changes, keyed on a primitive, so a regen tick does not end it. It also ends it on `reset()`.
- `useExits.beginTravel` and `useDestination.travel` both ask the guard. A rejected Map send ends it at once. A refusal lapses after 2 seconds.
- `Destination.pending` (its runner or the guard) drives `aria-busy` on DetailPanel and MapDock.
- The inert map carries a working guard, and the test fakes now build a fresh map per mount.
- **Test:** `src/rails/sharedTravelGuard.test.ts` mounts HereCard and ExitChips on one hub. It checks that a second surface cannot send, that a Map trip blocks both, and that the guard lapses.

### WR-05: The colour guard had an SVG hole
**Commit:** `e2226ba5`
- `templateColorOffenders` (in `cssContract.ts`) checks these attributes, static or as string literals in bound expressions: `fill`, `stroke`, `stop-color`, `flood-color`, `lighting-color` and `color`.
  - Allowed values: `var(--…)`, `none`, `currentColor`, `transparent` and `inherit`.
  - Static `style` attributes and `:style` literals are checked for named colours.
- It runs over every `.vue` template, including those in `src/map/`.
- The design contract also pins the elements inside a `src/map/` svg to shapes: `svg g defs title desc rect line polyline polygon path circle ellipse`. No `foreignObject`, `image`, `use`, `a` or `script`.
- The current code passes.

### WR-06 (client part): Bind in combat
**Commit:** `e53e6e74`
- The Bind button is `aria-disabled` while `game.combat.active`.
- Its title and an `aria-describedby` sentence (`useId`-based id) read `You cannot bind while in combat.`, the server's wording.
- `bind()` sends nothing during a fight.

### IN-01: Dead fields and the m:ss re-parse
**Commit:** `52102be1`
- Dropped `ExitRow.rightColor` and `ExitButton.fullLabel`.
- `ExitButton.secondsLeft` carries the server seconds. ExitChips builds the minute sentence from it and from `note.srText`, and `clockSeconds` is gone.
- `ExitsPanel.pending` is kept, because IN-02 now uses it.

### IN-02: The pending state was invisible in the rail and chips
**Commit:** `2690f47a`. The HereCard and ExitChips Travel and Cross buttons bind `aria-busy` to the shared guard.

### IN-03: The follower-timer copy read as your own timer
**Commit:** `3b52ac69`
- `ExitNote.blocker` holds the region check's label, for example "Mira can't cross yet".
- The rail note reads `{blocker} · ready in {m:ss}`, the chip card leads with `{blocker}.`, and `srText` names them.
- The rail note now also hides its whole visible phrase while the sentence speaks. It used to read "Region travel in Region travel ready in…", the same issue as client-map WR-04.

### IN-04: The lock sentence was missing when gathering outranked the timer
**Commit:** `59c7edea`. `ExitRow.lockText` is built from your own timer whenever the row is locked. `exitLabel` reads it.

### IN-05: The location line read its separators aloud
**Commit:** `b9b06b8e`. Each `·` in LocationRow is an `aria-hidden` span. The visible text is unchanged.

### IN-06: Vendor arguments leaked into the Map
**Commit:** `ef141ea9`
- AppFrame clears `screenArgs` on any change of the active id. `openScreen` sets them again after it opens.
- A new test covers opening the Map from the tab bar while the vendor is open.
- The file's working copy is CRLF, and that was preserved.

### IN-07: Examine in the mobile encounter sheet closed it
**Commit:** `e09cf178`. `consoleApi.examine` skips `closeScreen` while the active screen is `'encounter'`. Every other screen still closes first.

### IN-08: Uncharted exits had an empty right-hand column
**Commit:** `3fd99624`. `rightText` falls back to the danger word, `Danger unknown`, in `lv-unknown`, as LocationRow does.

## Deferred to 51-12 (layout rewrite)

| Finding | Why |
|---|---|
| client-map CR-01: gate pills over nodes | Out of scope by instruction. 51-12 MS-03 rewrites the gate placement. |
| client-map WR-03, layout part: mobile runs `useMapGraph` twice; `known` depends on the whole character row | Out of scope by instruction. 51-12 MS-06 handles it. `mapData.ts` `known` is unchanged. |
| client-map IN-06: `localeCompare` follows the runtime locale | Out of scope by instruction. `order.ts` is untouched. |
| client-map IN-07: gate pill tab order | Out of scope by instruction. `graphLayout.ts` is untouched. |

## Decided elsewhere

- **client-rest IN-09:** server side. The look order is kept and documented with a pinning test (`2332df38`, see `51-REVIEW-FIX-server.md`).

## Verification

- Touched tests are green: `src/map`, `src/rails`, `src/frame`, `src/styles`, `src/console`, `src/combat`.
- `npx vue-tsc -b`: exit 0, no output.
- Full `npx vitest run` from the repo root: 327 files and 9844 tests. 9842 pass. The only failures are the 3 known baseline files: `scripts/llm/call_log_report.test.mjs`, `scripts/llm/proof_rules.test.mjs`, and `spacetimedb/src/helpers/measurement.results.test.ts` (2 tests).
- **Guards:**
  - The added lines contain no `v-html`, literal colour, `replaceAll`, `.at(`, `Object.hasOwn` or banned word. The only `#fff` is a guard fixture inside a test.
  - Sizes and spacing are unchanged except the removed MapMeta rule.
  - The index stays LF everywhere. AppFrame.vue's CRLF working copy is preserved.
- **Processes:** the owner's SpacetimeDB and Vite were left running, and none of my processes remain. Nothing was published and the bindings were not regenerated.

## For plan 51-12 (layout rewrite)

Re-read these files before editing. They changed after the review:

- **`src/map/useMapGraph.ts`**
  - New `export interface ShownRegion` and `export function useShownRegion()`. They hold `currentId`, `playerLevel`, `placeById`, `drawnIds`, `currentRegionId`, `shownId` and `chips`.
  - `MapGraph extends ShownRegion`, and `useMapGraph` calls `useShownRegion()` once.
  - MapMeta calls `useShownRegion()`, not `useMapGraph`. The mobile sharing mechanism was **not** built, so pass MapScreen's graph to MapSheet as a prop as planned.
  - MapMeta.test pins one `regionChips(` and one `knownRegionIds.includes` in useMapGraph.ts. The plan's `useMapGraph(` count checks are unaffected (MapScreen 1, MapSheet 0).
  - When `known` moves to `currentLocationId`, keep `useShownRegion` the single owner of `currentId`, `shownId` and `chips`.
- **`src/map/MapScreen.vue`**
  - `root` template ref on both root divs.
  - `applyArgs` and `onBeforeUnmount` clear the banner.
  - The `shownId` watcher only picks the selection. A separate `watch(() => map.regionChosen.value, …)` does the scroll and `surface()?.focusCurrent()`.
  - In the arrival watcher, `destination.isOwnArrival(next)` runs first, on every change, and focus moves only when `ownTrip || focusInMap()`.
  - The `Surface` interface (`focusCurrent`, `scrollToNode`) is unchanged.
- **`src/map/mapContext.ts` and `src/map/mapData.ts`**
  - New hub members: `regionChosen`, `chooseRegion(id)`, `travelPending`, `beginTrip()`, `endTrip()`.
  - The hub ends the trip guard in a sync watch keyed on `` `${character.id}:${character.locationId}` ``. When 51-12 adds the `currentLocationId` computed, it can key the guard on that instead.
  - `known` is untouched (it still reads the character row).
  - Test fakes that spread `createInertMap()` get working defaults. Build one fake per mount, or the guard carries over between tests.
- **`src/map/GraphPlane.vue`**: one-line change only. Node buttons now have `:aria-pressed="view.pressed ? 'true' : 'false'"`. Keep `'false'` in the rewrite; `GraphPlane.test.ts` asserts it.
- **`src/map/useDestination.ts`**
  - `Destination` gains `pending` (its runner or the hub guard) and `isOwnArrival(id)`.
  - `travel()` asks `map.beginTrip()` and ends it on a rejected send.
  - `BuildDetailInput.peopleApplied` is required.
- **`src/map/mobileTargets.test.ts`**
  - `sizeOf` is now `mobileSizeOf`, which is media-aware at 390px with the cascade.
  - The gate test reads `.gate` `height` and `.gate.mobile::after` `inset: -Npx …` from GraphPlane's CSS and requires `height + 2N >= 44`. Keep both rules, or update the test with the new pill geometry.
- **`src/styles/designContract.test.ts`**: the svg in `src/map/` may use only `svg g defs title desc rect line polyline polygon path circle ellipse`. Extend `SVG_ELEMENTS` if the new layout needs another shape, but never `foreignObject`, `image`, `use` or `a`.
- **`src/styles/colors.guard.test.ts`**: svg `fill`, `stroke`, `stop-color` and the like, static or as bound string literals, must be `var(--…)`, `none`, `currentColor`, `transparent` or `inherit`. Bound expressions without literals, such as `:stroke="edgeColor(e)"`, pass.
- **MapSheet**: not edited, beyond `MapSheet.test.ts`, which gains `selectedApplied` (default true) in its map fake.

---

_Fixed: 2026-10-07_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
