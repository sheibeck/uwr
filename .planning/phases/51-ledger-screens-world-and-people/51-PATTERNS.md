# Phase 51: Ledger Screens: Map and Travel - Pattern Map

**Mapped:** 2026-10-07
**Scope:** Phase 51 only (Map, Travel, rail travel panel, rail row Examine/Talk/Bind). Not 51.1 (social) or 51.2 (events).
**Files analyzed:** 36 new or modified
**Analogs found:** 33 / 36

Note: `src/frame/Drawer.vue`, `Sheet.vue`, `AppFrame.vue`, `src/ledger/*`, `src/inventory/*` are being changed by Phase 50 plan 50-39 (Drawer/Sheet gain an `actions` slot). Excerpts below are from the pre-50-39 state. Re-read them at execution time and sequence the `end`-slot plan after 50-39. `git status` at mapping time shows only `src/inventory/backpack.test.ts` and `src/ledger/ledgerData.test.ts` modified.

## File Classification

### Server (spacetimedb/src)

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `schema/tables.ts` (+`VisitedLocation`, `PassageSweepTick`, register in `schema({...})`) | model | CRUD | `VendorBuyback` (tables.ts:1476), `VendorRestockTick` (tables.ts:2316) | exact |
| `views/visited.ts` (`my_visited_locations`) + `views/index.ts` + `views/types.ts` ViewDeps | view | request-response | `views/vendor_buyback.ts` | exact |
| `helpers/visited.ts` (`markLocationVisited`) | helper | CRUD upsert | `helpers/travel.ts` cooldown upsert (lines 151-164) | role-match |
| `data/travel_config.ts` (+`travelStaminaCost`, `travelEffectDiscount`) | utility | transform | duplicated math in `helpers/travel.ts:105-119,140-150` | exact (extract) |
| `helpers/travel.ts` (use shared helper, visited write, collapse trigger) | service | request-response | itself | modify |
| `helpers/passages.ts` (`collapsePassageIfEmpty`, `passageSides`, `sweepPassages`) | service | batch / transform | `helpers/location.ts` `connectLocations`; sweep loop in `index.ts:308-335` | role-match |
| `reducers/passages.ts` or index.ts block (`sweep_passages`, optional admin `collapse_passages`) | scheduled reducer | batch | `sweep_inactivity` / `restock_vendors` (`index.ts:308`, `:386`) | exact |
| `index.ts` (arm tick in `init` and `clientConnected`) | config | event-driven | `ensureVendorRestockScheduled` (`index.ts:341`, `:662`, `:687`) | exact |
| `helpers/examine.ts` (neighbour place, bind stone targets) | utility | request-response | itself (`describeAll`) | modify |
| `helpers/llm_apply.ts`, `world_gen.ts`, `character.ts`, `corpse.ts`, `reducers/characters.ts` (call `markLocationVisited` on spawn/respawn) | service | CRUD | call sites listed in RESEARCH "Mark a place visited" | modify |
| Server tests: `helpers/visited.test.ts`, `views/visited.test.ts`, `helpers/passages.test.ts`, `reducers/passage_sweep.integration.test.ts`, `data/travel_config.test.ts`, extend `look_intent.test.ts`, `scheduled_guard.integration.test.ts` | test | request-response | `views/vendor_buyback.test.ts`, `reducers/look_intent.test.ts`, `reducers/scheduled_guard.integration.test.ts` | exact |

### Client (src)

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src/map/mapData.ts` + `mapContext.ts` + `queries.ts` (hub) | store / provider | event-driven (subscriptions) | `src/ledger/ledgerData.ts`, `ledgerContext.ts`, `queries.ts` | exact |
| `src/session/useSession.ts`, `src/App.vue` (wire hub: `deps.map`, `session.map`, `provide`, reset/dispose) | config | event-driven | the `ledger` wiring (`useSession.ts:40-44,92-93,115-116,145-165,428-434,532,552,570`; `App.vue:6,23-24`) | exact |
| `src/map/danger.ts`, `terrain.ts`, `travelTimer.ts`, `knownPlaces.ts`, `route.ts`, `regionChips.ts`, `travelChecks.ts`, `detailModel.ts` | utility | transform | `src/rails/levelRange.ts` (pure, plain lists in, plain lists out, `compareNames`) | role-match |
| `src/map/graphLayout.ts` | utility | transform | `src/rails/levelRange.ts` `routesFrom` (ordering + bigint compare) | partial |
| `src/map/MapScreen.vue` + `GraphPlane.vue`, `GraphList.vue`, `DetailPanel.vue`, `MapLegend.vue`, `MapSheet*.vue` | component | request-response | `src/screens/MapScreen.vue` (placeholder to replace); `src/vendor`/`src/crafting` screens for Ledger screen structure | role-match |
| `src/map/MapMeta.vue` (region chips), `MapEnd.vue` (travel pill) | component | request-response | `src/inventory/InventoryMeta.vue` | exact |
| `src/screens/screens.ts` (`meta`, new `end`) | config | n/a | itself (`ScreenDef.meta`) | modify |
| `src/frame/Drawer.vue`, `Sheet.vue`, `AppFrame.vue` (`end` slot, render `#end`, keep args for `map`) | component | n/a | `Drawer.vue` `meta` slot | modify (collides with 50-39) |
| `src/frame/frameControls` / `useScreens.ts` `ScreenArgs` + `{ locationId?, regionId? }` | utility | n/a | existing `{ npcId?, npcName? }` for vendor (`frameControls.test.ts:177-241`) | exact |
| `src/rails/HereCard.vue` -> exits panel | component | request-response | itself | modify |
| `src/rails/NearbyList.vue` (Examine eye, Talk, bind row) | component | request-response | itself | modify |
| `src/combat/HostileCard.vue` row wrapper / `EncounterPanel` (eye beside card) | component | request-response | `NearbyList.vue` enemy row (`row-main static` + sibling icon button) | role-match |
| `src/rails/PartyBlock.vue` (stamina text) | component | request-response | itself | modify |
| `src/frame/LocationRow.vue` (mobile exit chips) | component | request-response | itself | modify |
| `src/game/context.ts` (`GameReducers.bindLocation`, `ConsoleApi.look`, inert versions) | config | n/a | existing entries | modify |
| `src/console/useConsole.ts` (`look()`), `keywordLabel.ts` (`Hail` -> `Talk to`) | utility | request-response | `examine` (`useConsole.ts:393`), `hail` (`:373`) | exact |
| Guard tests: `src/styles/designContract.test.ts` (svg), `src/frame/frameContract.test.ts` (1200px), `screens.test.ts`, `AppFrame.screens.test.ts`, `gameDataAlias.test.ts`, `railsShell.test.ts`, `nearby.test.ts`, `keywords.test.ts` | test | n/a | the same files | modify |
| `src/map/*.test.ts`, component tests | test | n/a | `src/ledger/ledgerData.test.ts`, `src/ledger/queries.test.ts`, `src/ledger/NoticeLine.test.ts` | role-match |

## Pattern Assignments

### `schema/tables.ts` `VisitedLocation` + `PassageSweepTick` (model, CRUD)

**Analog:** `VendorBuyback` (`tables.ts:1476`, private, no `public: true`) and `VendorRestockTick` (`tables.ts:2316`).

Scheduled table shape to copy:
```typescript
export const VendorRestockTick = table(
  { name: 'vendor_restock_tick', scheduled: () => scheduledReducers['restock_vendors'] },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    afterNpcId: t.u64(),
  }
);
```
New: `PassageSweepTick` with `scheduled: () => scheduledReducers['sweep_passages']` and only `scheduledId` + `scheduledAt`. Register both in the `schema({...})` object (the list ends at `tables.ts:2447-2449`: `vendor_restock_tick: ..., action_result: ActionResult`). `VisitedLocation` indexes go in OPTIONS (first arg): `by_character`, `by_location`, per RESEARCH Pattern 1. Auto-inc id needs `id: 0n` on insert.

### `views/visited.ts` (view, request-response)

**Analog:** `views/vendor_buyback.ts` (whole file, 27 lines). Copy its split: an exported pure row function (so tests call it directly) plus `registerXViews = ({ spacetimedb, t, VisitedLocation }: ViewDeps)`.
```typescript
export function myVendorBuybackRows(ctx: any): any[] {
  const player = ctx.db.player.id.find(ctx.sender);
  if (!player?.activeCharacterId) return [];
  const row = ctx.db.vendor_buyback.characterId.find(player.activeCharacterId);
  return row ? [row] : [];
}
export const registerVendorBuybackViews = ({ spacetimedb, t, VendorBuyback }: ViewDeps) => {
  spacetimedb.view({ name: 'my_vendor_buyback', public: true }, t.array(VendorBuyback.rowType), (ctx: any) => myVendorBuybackRows(ctx));
};
```
Difference: many rows, so use `ctx.db.visited_location.by_character.filter(player.activeCharacterId)` (index lookup only, never `.iter()`). Register in `views/index.ts` (add import and `registerVisitedViews(deps)` next to `registerVendorBuybackViews(deps)` at line 14/26) and add `VisitedLocation` to `ViewDeps` in `views/types.ts` plus the `registerViews({...})` call in `index.ts`.

### `views/visited.test.ts`, `helpers/visited.test.ts` (test)

**Analog:** `views/vendor_buyback.test.ts` lines 1-60.
```typescript
vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);
beforeAll(async () => { await import('../schema/tables'); });   // strict mock db reads accessors from recorded schema
// asserts: recordedTable('visited_location').opts.public not true; exact column set; kinds/optional/primaryKey/autoInc
```
Also assert a second player's view returns nothing of the first (RESEARCH Security).

### `helpers/passages.ts`, `reducers/passage_sweep.integration.test.ts`, scheduled reducer (batch)

**Analog (reducer):** `index.ts:308-335` `sweep_inactivity` and `:386` `restock_vendors`. Guard is the FIRST statement, then re-arm, then work.
```typescript
scheduledReducers['sweep_inactivity'] = spacetimedb.reducer('sweep_inactivity', { arg: InactivityTick.rowType }, (ctx) => {
  if (ctx.sender.toHexString() !== ctx.databaseIdentity.toHexString()) return;
  const now = ctx.timestamp.microsSinceUnixEpoch;
  ctx.db.inactivity_tick.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.time(now + INACTIVITY_SWEEP_INTERVAL_MICROS) });
  for (const player of ctx.db.player.iter()) { ... }
});
```
Interval constant: `const INACTIVITY_SWEEP_INTERVAL_MICROS = 300_000_000n; // 5 minutes` (`index.ts:306`). Online set = players with `activeCharacterId` (iterate `ctx.db.player.iter()`, as above).

**Analog (arming):** `index.ts:341-348`, called from `init` (`:662`) and `clientConnected` (`:687`) because init does not run on republish:
```typescript
function ensureVendorRestockScheduled(ctx: any): void {
  if ([...ctx.db.vendor_restock_tick.iter()].length > 0) return;
  ctx.db.vendor_restock_tick.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch), afterNpcId: 0n });
}
```
Add `ensurePassageSweepScheduled` and call it in both places.

**Analog (test):** `reducers/scheduled_guard.integration.test.ts`: add to the `SCHEDULED` list (line 20-33, shape `{ name, file: '../index.ts', arg: { scheduledId: 1n }, touchesDb: true }`) and the forged-chain case list (line ~78: `{ name: 'restock_vendors', table: 'vendor_restock_tick', seed: () => startSeed() }`). That test also cross-checks coverage (line 121), so a missing entry fails.

**Collapse logic:** no analog for deletion + re-pointing; use RESEARCH "Collapse a passage" sketch plus `helpers/location.ts` `connectLocations` (lines 44-47 write both directed rows) and `areLocationsConnected`. Dependent-table list is RESEARCH Pitfall 5.

### `helpers/travel.ts` and `data/travel_config.ts` (service / utility)

**Analog:** the current code. Replace the two duplicated blocks (lines 105-119 and 140-150) with the shared helper:
```typescript
// travel.ts:107-114 (duplicated again at 142-149)
const rawCost = staminaCost + (traveler.racialTravelCostIncrease ?? 0n);
const abilityDiscount = [...ctx.db.character_effect.by_character.filter(traveler.id)]
  .filter((e: any) => e.effectType === 'travel_discount' && e.roundsRemaining > 0n)
  .reduce((sum: bigint, e: any) => sum + BigInt(e.magnitude), 0n);
const effectiveCost = rawCost > totalDiscount ? rawCost - totalDiscount : 0n;
```
Keep `data/travel_config.ts` import-free (client imports it through `@game-data/travel_config`; pin in `src/gameDataAlias.test.ts`). Call `markLocationVisited` inside `moveOne` (travel.ts:168-175, pass `originLocationId`). Run the collapse check once after the move loop (`travel.ts:262-264`), per distinct origin (RESEARCH Pitfall 4). Cooldown upsert at lines 151-164 is the model for `markLocationVisited`'s upsert (`by_character.filter(...)[0]` then `.id.update({...existing, ...})` else `insert({ id: 0n, ... })`). Refusals go through `fail(msg)` -> `appendSystemMessage` (kind `system`).

### `helpers/examine.ts` (utility, request-response)

**Analog:** itself. Add late categories to `describeAll` (lines 183-213) so existing exact-name behavior is unchanged:
```typescript
function describeAll(ctx: any, character: any, matches: NameMatcher): string | null {
  // (a) NPCs ... (b) Enemies ... (c) Other players ...
  return describeNode(ctx, character, matches) ?? describeItem(ctx, character, matches);   // add: ?? describeNeighbourPlace ?? describeBindStone
}
```
Use `ctx.db.location_connection.by_from.filter(character.locationId)` then `ctx.db.location.id.find(to)`; bind stone text compares `character.boundLocationId === location.id`. Server copy only (no LLM). `describeLookTarget` runs an exact pass then a partial pass (lines 221-227). Tests: extend `reducers/look_intent.test.ts` (uses `capturedReducer('submit_intent')` after `await import('../index')`, `createMockCtx({ seed, sender, timestampMicros, strict: true })`, reads `ctx.db._tables.event_private`) and `helpers/examine.test.ts`.

### `src/map/mapData.ts`, `mapContext.ts`, `queries.ts` (hub)

**Analog:** `src/ledger/ledgerData.ts`, `ledgerContext.ts`, `queries.ts`. Copy:

Imports (ledgerData.ts:1-19):
```typescript
import { computed, effectScope, shallowRef } from 'vue';
import type { Ref, ShallowRef } from 'vue';
import type { BindTableOptions, ConnLike, TableBinding, TableLike } from '../net/bindTable';
import { createKeyed, idListKey, keyedRows, parseIdListKey } from '../game/keyedBinding';
```
Structure: `MapConn extends ConnLike { db: {...}; reducers }`, `MapInput<C>`, `MapDeps<C>` (`bind`, `queries`), `createMapData(deps, input)`, one `effectScope`, `keyedTable` helper (ledgerData.ts:93-106) and `keyedIdList` (109-124), returning `{ keyed: [...], ...rows }`, plus `reducers` computed that is `null` while disconnected (311-333), `reset()` and `dispose()` (339-347: `scope.stop(); for (const keyed of run.keyed) keyed.reset()`).

Character-keyed view binding with immediate swap (ledgerData.ts:152-158) is the model for `myVisitedLocations`:
```typescript
const lastSaleKeyed = keyedTable<VendorBuyback, bigint>(
  characterKey, (c) => c.db.myVendorBuyback, () => queries.myVendorBuyback,
  (row, k) => row.characterId === k, 'immediate');
```
Selected-place keyed bindings (npc, character by `location_id`) follow `vendorStockKeyed` (169-175, key from a `shallowRef` target, `setVendor`-style setter 335-337). Follower `travel_cooldown` uses the id-list pattern (`idListKey`, OR chain). Rule: every keyed binding passes a filter equal to its SQL.

`queries.ts` (ledger/queries.ts:1-50): `toSql(tables.x.where((r) => r.col.eq(id)))`; views via `toSql(tables.myVendorBuyback)` with no WHERE; id lists via `ids.map((id) => r.x.eq(id)).reduce((a, b) => a.or(b))` and a `requireIds` empty-list throw. Whole-table `location_connection`: `toSql(tables.locationConnection)`.

Selection state, `shownRegionId`, view mode and arrival banner live in the hub like `vendorTarget`/`setVendor`.

### Session wiring: `useSession.ts`, `App.vue`

**Analog:** the ledger hub wiring. Add a `map` entry at each of: imports (`useSession.ts:40-44`), `SessionDeps` optional builder (`:92-93`, "Omitted: the session carries an inert hub"), `Session` field (`:115-116`), real deps (`:145-165`: `ledger: (input) => createLedgerData({ bind: bindTable, queries: ledgerQueries() }, input)`), construction with inert fallback (`:428-434`), `reset()` (`:532`), return object (`:552`), dispose (`:570`). `App.vue:6,23-24`: `provide(LEDGER_KEY, session.ledger ?? createInertLedger())`. Add `createInertMap()` in `mapContext.ts` like `createInertLedger`.

### `src/map/MapMeta.vue`, `MapEnd.vue` (component)

**Analog:** `src/inventory/InventoryMeta.vue` (inject GAME_KEY + hub key with inert defaults; render nothing until applied):
```vue
const game = inject(GAME_KEY, createInertGame());
const ledger = inject(LEDGER_KEY, createInertLedger());
const ready = computed(() => game.character.value !== null && ledger.itemsApplied.value);
<span v-if="ready" class="inventory-meta">...
```
Region chips are buttons with `aria-pressed`. Registered via `ScreenDef.meta`; the new `end` field mirrors it.

### `src/screens/screens.ts` (config)

**Analog:** itself. Map entry is currently `{ id: 'map', title: 'Map', label: 'Map', icon: PhMapTrifold, component: MapScreen, inHeader: true }` (line 42); other entries show the `meta: XMeta` pattern (lines 44-50). Add `meta: MapMeta, end: MapEnd`, and an optional `end?: Component` to `ScreenDef` (lines 25-39). Component import path moves from `./MapScreen.vue` to `../map/MapScreen.vue` (like `../vendor/VendorScreen.vue`, line 18).

### `src/frame/Drawer.vue` `end` slot (component) - COLLIDES WITH 50-39

**Analog:** the `meta` slot, lines 38-52:
```vue
<h4 :id="titleId">{{ props.title }}</h4>
<span class="drawer-meta"><slot name="meta" /></span>
<span class="drawer-spacer"></span>
<button ref="closeButton" ... class="btn btn-ghost btn-icon drawer-close" ...>
```
Insert `<slot name="end" />` between spacer and close button. `.drawer-meta` is an inline span with no wrap; chips need `display: flex; flex-wrap: wrap; gap: 4px; min-width: 0`. The close button is focused on mount (`closeButton.value?.focus()`, line 26); Tab trap at document via `trapTabKeyAtDocument`. Mirror in `Sheet.vue` (renders `<slot name="meta" />` bare). Re-read both after 50-39 lands.

### `src/map/MapScreen.vue` and children (component)

**Analog:** the existing placeholder `src/screens/MapScreen.vue` for the mobile branch (`frame.isDesktop.value`, `ContextContent` as the `Here` tab body, `.map-sheet` column `gap: 16px`) and `EmptyState.vue` for the empty state:
```vue
<EmptyState v-if="frame.isDesktop.value" :icon="PhMapTrifold" title="No places discovered yet." body="..." />
<div v-else class="map-sheet"><ContextContent /></div>
```
Reuse from `src/ledger/`: `SegTabs.vue` (Map/Here, Graph/List), `NoticeLine.vue` (`:rejection="runner.rejection.value"`), `createActionRunner`. Travel action runner usage:
```typescript
const runner = createActionRunner({ online: connected });   // actionRunner.ts:21
const ok = await runner.run('travel', () => map.reducers.value!.moveCharacter({ characterId, locationId }));
```
The Map must call `moveCharacter` itself (not `consoleApi.travel`, which closes the screen: `useConsole.ts:383-391`). `NoticeLine` mirrors `MIRRORED_KINDS = system | reward | heal`; it only shows lines that arrive after mount. `GraphPlane.vue` is the only `<svg` file (RESEARCH "SVG plane" excerpt); tokens only; positions via inline `:style`. For heading rules use `h4`/`h6` only.

### Pure helpers (`danger.ts`, `knownPlaces.ts`, `graphLayout.ts`, `route.ts`, ...)

**Analog:** `src/rails/levelRange.ts` (plain inputs, no Vue). Reuse, do not rewrite, `routeLevel` and `routesFrom`:
```typescript
export function routeLevel(dest: { isSafe: boolean; regionId: bigint; levelOffset: bigint }, regions: readonly { id: bigint; dangerMultiplier: bigint }[]): RouteLevel
function compareNames(a: string, b: string): number { return a.localeCompare(b, undefined, { sensitivity: 'base' }); }
out.sort((a, b) => { const byName = compareNames(...); if (byName !== 0) return byName; return a.locationId < b.locationId ? -1 : a.locationId > b.locationId ? 1 : 0; });
```
Bigint ordering uses `<`/`>` ternaries, never subtraction. `dangerBand` must test `terrainType === 'uncharted'` before `isSafe` (RESEARCH anti-pattern). `travelTimer` code is in RESEARCH "Timer read"; time source is `game.clock.nowMicros()` (`src/game/serverClock.ts`), never `Date.now()` math on reductions. Tests: `src/rails/levelRange.test.ts` style (pure, no DOM).

### `src/rails/HereCard.vue` (component, exits panel)

**Analog:** itself. Today: routes via `routesFrom(game.connections.value, character.locationId, game.locations.value, game.regions.value)` (lines 25-32), a row click calls `consoleApi.travel({ id, name })` (34-37), `aria-disabled` when offline, 44px min-height under `@media (max-width: 899px)`. Phase 51 changes the row click to expand, moves travel to an inner `Travel`/`Cross` button (aria-labels `Travel to {place}` / `Cross into {Region}`), still through `consoleApi.travel` (rail keeps it). Keep `game.connections` as the data source for exits only (map hub holds the whole table).

### `src/rails/NearbyList.vue` (component) and enemy eye

**Analog:** itself. Row anatomy to extend (lines 127-206): `li.nearby-row` > `.row-main` (button or `.static`) + sibling `btn btn-ghost btn-icon` buttons using `:aria-label`, `:title`, `:aria-disabled="disabledAttr"`, 16px Phosphor icons, 28px (44px mobile). Add:
- Examine eye: `<button ... :aria-label="`Examine ${row.name}`" @click="consoleApi.examine(row.name)"><PhEye :size="16" aria-hidden="true" /></button>` on every row, including the enemy row (`li.kind-enemy`, lines 127-149, where the Pull button already sits beside `.row-main.static`, which is the model for "eye beside the card, never nested").
- Talk: `PhChatCircleDots` button replaces the hail row-click: `act()` for npc currently calls `consoleApi.hail({ id, name })` (line 95); make the row static and move hail to the icon (`Talk to {name}`), hint drops "hail" (nearby.ts hint text).
- Three-button cap on player rows (Whisper, Invite, Examine; lines 184-205).
- Bind stone row: static row with `PhCastleTurret`; `Bind` calls `game.reducers.bindLocation({ characterId })` (needs the `GameReducers` addition, Pitfall 10); "Bound here" when `character.boundLocationId === character.locationId`.
Trade pattern for opening screens: `frame.openScreen('vendor', { npcId, npcName })` (lines 104-107).

### `src/game/context.ts`, `src/console/useConsole.ts`, `keywordLabel.ts`

**Analog:** existing `hail` (`useConsole.ts:373`), `travel` (`:383`), `examine` (`:393`). Add `look()` sending `look`, exposed in the returned object (`:487-489`) and `ConsoleApi` interface plus `createInertConsole`. `GameReducers` (context.ts) lacks `bindLocation`; add `bindLocation(a: { characterId: bigint }): Promise<void>` plus the inert game entry. Keep `context.ts`, `gameData.ts`, `queries.ts` free of literal colors, `<svg`, `replaceAll`, `.at(` (`effectChipsGuards.test.ts`). `keywordLabel.ts` `VERBS.npc: 'Hail'` -> `'Talk to'` (and `keywords.test.ts`).

### Guard test edits

- `src/styles/designContract.test.ts:251-256`: current offender filter is `files.vue.filter((file) => /<svg\b/i.test(sfcTemplateAndScript(read(file)))).map(rel)`; add a `!rel(file).startsWith('src/map/')` exclusion, and add a fixture-style test that an svg outside `src/map/` is flagged and one inside is allowed.
- `src/frame/frameContract.test.ts:92`: `const ledgerScreen = /^src\/(inventory|stats|vendor|crafting)\//;` add `map` (51.1 `social`, 51.2 `events` later); update the test title/comment.
- `screens.test.ts`, `AppFrame.screens.test.ts` (placeholder lines ~111-116, ~343-391): new Map copy and `meta`/`end`.

## Shared Patterns

### Private per-character table + `my_*` view
**Source:** `spacetimedb/src/views/vendor_buyback.ts` (see above). Apply to `visited_location`. Views: index lookups only.

### Scheduled table + module-identity guard
**Source:** `spacetimedb/src/index.ts:308` and `:386`; arming `:341`. Apply to `sweep_passages`. Guard first, before any `ctx.db` access; table pk is `scheduledId` (`ctx.db.passage_sweep_tick.scheduledId.delete(id)`, never `.id`).

### Keyed subscription with filter equal to SQL
**Source:** `src/ledger/ledgerData.ts:93-124` + `src/game/keyedBinding.ts`. Apply to every map hub binding. Use `'immediate'` swap for character-keyed ones.

### Reducer call + refusal display in a drawer
**Source:** `src/ledger/actionRunner.ts` (`run(key, call)` returns boolean, never throws, counts rejections) + `src/ledger/NoticeLine.vue`. Object-argument reducer calls only (`{ characterId, locationId }`). Nothing optimistic; arrival detected by watching `character.locationId`.

### Errors on the server
**Source:** `travel.ts:44-46` (`fail = (msg) => appendSystemMessage(ctx, character, msg)`); project memory prefers `fail(ctx, character, msg)` over `SenderError`.

### Server rules reach the client by import, never copy
**Source:** `@game-data/*` alias (`vite.config.ts`), guarded by `src/gameDataAlias.test.ts`. Apply to the travel stamina helper.

### Test harness (server real-handler)
**Source:** `reducers/look_intent.test.ts:1-50` (`vi.mock('spacetimedb/server', ...createRecordingServerMock())`, `await import('../index')`, `capturedReducer(name)`, `createMockCtx({ seed, sender, timestampMicros, strict: true })`); fixtures in `helpers/combat_fight_fixture.ts`. Define new tables in `schema/tables.ts` first so the strict mock knows the accessors.

### Design guards (apply to every new `.vue`)
Tokens only (pin 23), no literal colors (SVG too), no `v-html`, `<svg` only in `src/map/`, Phosphor icons only, sizes 10/12/14/20, weights 400/500, spacing 4/8/16/24/32/48/64, `h4`/`h6` only, no `replaceAll`/`.at(`/`Object.hasOwn`, never the word "ripple". No folder named `components`, `composables`, `ui` or `data`. Text nodes only for every server string.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/map/graphLayout.ts` | utility | transform | No layout or graph code exists; only `routesFrom` ordering to borrow. Use RESEARCH Pattern 5 + UI-SPEC "Route graph" steps. |
| `src/map/GraphPlane.vue` (SVG) | component | render | No `<svg` is allowed anywhere today (guard). Use RESEARCH "SVG plane" excerpt. |
| `helpers/passages.ts` collapse/re-home | service | batch | No existing code deletes a location and re-points dependents. Use RESEARCH "Collapse a passage" and Pitfall 5 list. |
| Shared 1-second tick composable for `m:ss` timers | utility | event-driven | Closest precedents (`src/rails/WorldEventCard.vue`, `useCooldownTicker.ts`) were not read; planner should open them before writing. |

## Metadata

**Analog search scope:** `spacetimedb/src/{index.ts,schema,views,helpers,data,reducers}`, `src/{ledger,rails,frame,screens,inventory,session,game,console,styles}`.
**Files read:** ledgerData.ts, actionRunner.ts, ledger/queries.ts (head), NoticeLine.vue (head), vendor_buyback.ts and test (head), travel.ts, examine.ts, index.ts (scheduled blocks, init, clientConnected), tables.ts (grep), Drawer.vue, screens.ts, HereCard.vue, NearbyList.vue, MapScreen.vue (placeholder), InventoryMeta.vue (head), levelRange.ts, designContract.test.ts and frameContract.test.ts (excerpts), look_intent.test.ts (head), scheduled_guard test (grep).
**Not read (planner should open at execution time):** `Sheet.vue`, `AppFrame.vue`, `useScreens.ts`/`frameControls`, `ledgerContext.ts`, `keyedBinding.ts`, `PartyBlock.vue`, `LocationRow.vue`, `HostileCard.vue`, `context.ts`, `useConsole.ts` bodies (line refs above come from grep and research).
**Pattern extraction date:** 2026-10-07
