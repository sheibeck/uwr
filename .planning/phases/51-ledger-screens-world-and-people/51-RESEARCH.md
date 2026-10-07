# Phase 51: Ledger Screens: Map and Travel - Research

**Researched:** 2026-10-07
**Domain:** Vue 3.5 client screens (route-graph map, rail travel panel, rail row actions) plus additive SpacetimeDB 2.10 TypeScript server changes (visited places, shared travel cost, neighbour look, passage collapse and sweep)
**Confidence:** HIGH (every code fact below was read in this repo or queried from the local database in this session; the few design choices that are recommendations are tagged `[ASSUMED]` and listed in the Assumptions Log)

> Scope note. `51-CONTEXT.md` and `51-UI-SPEC.md` cover 51, 51.1 and 51.2. This research is Phase 51 only (Map and Travel, LDG-04 and LDG-05, the rail travel panel, and the rail row additions Examine, Talk and bind stone). It also names the pieces 51.1 and 51.2 will build on ("Shared pieces" below). Party, Social, online status, friends, invites, world events and the party/player menus are not researched here.

<user_constraints>
## User Constraints (from CONTEXT.md)

Copied verbatim from `51-CONTEXT.md`. Only the subsections that bind Phase 51 are reproduced; Areas 2, 3 and the party/player-menu half of Area 4 belong to Phases 51.1 and 51.2 and are in the same file.

### Locked Decisions

**Map and travel (Area 1)**
- **Known places are recorded on the server.** Add a private per-character table of visited places, written on arrival (`performTravel`) and on character creation or first spawn, exposed through a `my_*` view. A place is **heard of** when it connects to a visited place; this is derived on the client from `location_connection`. The map grows as the player explores. Places neither visited nor heard of are not shown.
- **The client lays out the route graph from the connections.** Places have no coordinates and the guard bans `<svg>`. Put the region's start place on the left and arrange places by their step distance from it, deterministically (same layout every time). Edges may use SVG on the map screen only (see the second revised map mock section), in the same coordinate space as the nodes, so dots and lines never drift apart.
- **Travel buttons:** superseded by the second revised map mock: one Travel button (see that section). Members get a **Follow leader** switch on the Social screen and in the self menu (`set_follow_leader`, which exists but is unwired).
- **Neighbours only (owner decision).** Travel buttons appear only for places next to the current one. Farther places show their highlighted path but no Travel button. Owner: "Travel to a far place requires a special ability, like teleport, otherwise, you must walk step by step." Research whether a teleport-style ability exists; if not, the node detail just says so (no new ability in this phase).
- **Region list:** every generated region the player knows, with its level range from the existing rule (`routeLevel` in `src/rails/levelRange.ts`, the min to max across the region).
- **Regions lock only by travel restriction (owner, 2026-10-06):** "Regions are locked via travel restrictions only. You have a timer that simulates travelling long distances between regions. This can be reduced via special abilities like bard travel songs, or other things that affect travel speed." While the caller's cross-region cooldown (`travel_cooldown`, 5 minutes base, shortened by the renown perk `travelCooldownReduction` and travel-speed effects) is running, every other region shows the lock (the mock's dimmed `ph-lock-simple` chip) with the remaining time, and cross-region Travel is disabled with the time left. Travel within the region is unaffected. The client shows the server's remaining time and never computes reductions itself. With no timer running, nothing is locked. Research checks which effects shorten the timer today (bard songs may not exist yet).
- **Travel cost** is shown from the server rules (`data/travel_config.ts`: stamina 5 within a region, 10 across, racial and effect modifiers), plus the cross-region cooldown from `travel_cooldown` (subscribe to the caller's own row).
- **Services** come from existing data: vendor and banker NPCs (`npcType`), `location.craftingAvailable`, `location.bindStone`, and `isSafe`. Trainer and inn are not mechanics; do not show them.
- **Related quests** use `quest_template` links (target location, source location, the giver NPC's location) within what the client can see. Research what extra subscription that needs.

**Examine button (Area 4, the Phase 51 half)**
- **Examine (eye) button:**
  - An eye button (Phosphor eye) sits on every enemy, player, NPC, object and place row in the right rail, with the label "Examine {name}". It sends the same intent as typing `look at <name>` (`ConsoleApi.examine`).
  - The server learns to look at neighbouring places (today `look` covers only the current place).
  - On enemy cards (`HostileCard.vue` is a single `<button>`), the eye sits beside the card, never nested inside it.

**Owner additions after discuss (2026-10-06)**
- **Bind stone in Nearby (owner request):** when the current place has `location.bindStone`, Nearby shows a bind stone row. It has a standing-stone style icon (closest Phosphor icon; the UI-SPEC names it), a **Bind** action calling the existing `bind_location`, "Bound here" when `character.boundLocationId` is this place, and the Examine eye. Todo: `2026-10-06-bind-stone-in-nearby-with-bind-action.md`.
- **Chat bubble instead of "hail" (owner request):** NPC rows in Nearby get a chat bubble icon button that does the hail, labelled "Talk to {name}". The row hint drops "hail". The UI-SPEC decides whether the feed keyword label "Hail {name}" also becomes "Talk to {name}". Todo: `2026-10-06-nearby-npc-chat-bubble-instead-of-hail.md`.
- **Revised map mock (owner, 2026-10-06):** `UWR Map.dc.html`, screen 11a, extracted to the session scratchpad `design51/map/MAP-EXTRACT.md`. It supersedes Ledger 2d for the map. The drawer covers the centre feed and right rail, and the real left vitals rail stays visible (not the mock's reduced copy). Region chips sit in the title row, and the legend is a floating pill. Overrides: the locked region chip means the cross-region travel timer is running (see Region list); edges are CSS, not SVG; and the missing far-place state is added (path highlighted, no Travel buttons, a note about walking step by step or teleport abilities).

**Second revised map mock (owner, 2026-10-07): decisions**
- **Source:** `UWR Map.dc.html` re-imported to the session scratchpad `design51/map2/MAP2-EXTRACT.md`. It supersedes the earlier 11a extract. It is a working prototype with terrain icons, danger rings against your level, a "Region travel: Ready / m:ss left" pill, region borders, border pills ("To Saltmarsh · Lv 4–7"), a "Region crossing" block, door icons in routes, "Cross into {Region}" and "Select first stop: {name}". It does not show sub-regions (999.26). The mock has 12 places; the 10-place cap belongs to 999.26.
- **Regions lock only by the travel timer (owner re-confirmed).** Drop the mock's level gate ("Requires level 10", "Locked until level 10"). The border pill's level range is a warning only. The lock and the time left appear only while the caller's region-travel timer runs, read from the server; the mock's hard-coded "5:00" is not used.
- **Party travel follows the mock (owner; replaces the earlier two-button decision).** There is one Travel button. When the leader travels, members with Follow leader on come along (today's server behaviour). The left vitals rail shows the party's stamina so the leader can see who is low. There is no "Travel alone" button and no new solo-travel reducer. A member's Travel moves only that member, as today.
- **SVG is allowed on the map screen only (owner).** The region border, cross-region links and route highlight may be drawn in SVG to match the mock, on desktop and mobile. The `<svg` guard gets exactly one allowed folder, the map screen's folder (for example `src/map/`). Everything else keeps the ban, and the SVG still uses tokens, never literal colors. Nodes and edges must share one coordinate space, so the mock's mobile misalignment does not come back. This replaces the earlier "CSS edges" rule.
- **Dungeons show "Dungeon" with their danger,** as normal shared places. Drop "instanced"; the game has no instances.
- The real left vitals rail stays (not the mock's cut-down copy), and it gains the party stamina the mock shows if the rail lacks it. Region chips are clickable and select the region. After travelling, the detail panel shows the new current place, not a blank. Add Swamp to the terrain legend.

**Updated party mock and console travel panel (owner, 2026-10-07)** (the console half binds Phase 51; the pet HUD half is 51.1)
- **Console travel panel.** The owner sent `UWR Console.dc.html`, an updated travel panel in the main right rail. It is re-imported to the session scratchpad `design51/console/CONSOLE-EXTRACT.md` and is the source for the rail's routes and Here panel.

**Region transitions collapse after discovery (owner, 2026-10-06)**
- **Keep the uncharted "Edge Beyond {Region}" until it is explored.** It is how players find the unknown, and the map shows it as "something lies beyond".
- **After the next region is generated, the edge goes away.** Today it is renamed "The Passage to {Region}" and stays a stop of its own (`llm_apply.ts:522-531`). Instead, link its neighbour on this side directly to the new region's arrival point and delete the passage. The map draws that link as a **border crossing** showing where the regions meet, and crossing it starts the travel timer.
- **The passage stays until it is empty (owner, 2026-10-06).** Generation moves no one. The explorer and anyone else standing on the edge are still there afterwards, as today.
  - While any character stands in it, the passage stays as a stop leading both ways.
  - When the last character leaves, in either direction, it collapses into the direct border crossing.
  - A periodic sweep (a scheduled table with the module-identity guard) stops offline characters from holding it open forever. It moves any offline character still standing in a passage back to the neighbour on their own side (never across the border), then collapses the passage.
- **Edge cases:**
  - Binds, quests and events that point at a passage are re-pointed or cleared.
  - Existing passages in the local world are cleaned up once, by a guarded or admin step. Never clear the database (it wipes the key).
  - Real-handler tests cover all of these.

**World structure moves to its own milestone (owner, 2026-10-06)**
- 10-place regions, typed sub-regions (no travel timer inside them), hidden places revealed by quests, type-driven creatures, gatherables and loot, the two prompt changes, and the map's layer view all move to backlog **999.26**, which becomes its own milestone after v3.0. The owner's decisions are recorded there.
- Phase 51 builds the map on today's world, with border crossings and travel-timer locks. Keep the map code ready for layers later; do not build the layer view now.

**Shared rules**
- Server changes are additive (new tables, views, reducers and defaulted columns). Publish locally only: `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null`, checking `admin_llm_status` key length 108 before and after; never `--clear-database`; regenerate the bindings. Real-handler tests for every rule. Prefer `fail(ctx, character, msg)` where a character exists.
- Design guards: no literal colors (the token pin stays at 23), no v-html, no `<svg`, Phosphor icons and Inter only, sizes 10/12/14/20, weights 400/500, spacing 4/8/16/24/32/48/64, text nodes only, no `replaceAll`/`.at`/`Object.hasOwn`, and never the word "ripple" (use "World event"). Map off-scale mock values to the nearest allowed ones.
- Whisper: the mock shows "/tell", but the command is `whisper` / `w`. Use the real command.

### Claude's Discretion
- The exact graph layout algorithm, provided it is deterministic and readable.
- Storage shapes for visited places, online status, tracking, the event timeline and invite expiry, provided they are additive and private where per-player.
- The scheduling interval, announcement lead time and duration of rule-based events, within sensible play values. Research proposes them and the plan states them.
- Splitting the phase into many small plans (Phase 50 used 27 and more).

### Deferred Ideas (OUT OF SCOPE)
- Player trade (Party mock 6c): Phase 52.
- The Journal's redesigned tracking block (Journal mock 5c): Phase 52 with 999.16.
- Loot modes (round robin, leader decides).
- Vote-to-remove.
- Stored party chat history.
- Menus on names inside feed text.
- A teleport-style ability for far travel, if none exists.
- "Heard of" from rumours and NPC mentions (backlog 999.10). This phase uses connections only.
- World structure: 10-place regions, typed sub-regions, hidden places and the map layer view (backlog 999.26, next milestone).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LDG-04 | Map: known locations in a region as a route graph, with a legend (here, visited, heard of, bind point) and a region list with level ranges. | Visited table + `my_visited_locations` view (S2); whole `location_connection` subscription; pure `knownPlaces`, `graphLayout`, `danger`, `terrain` helpers; SVG-in-`src/map/` guard change (O1); region chips from `routeLevel`; passage collapse so the graph shows direct border crossings (S4, S5). |
| LDG-05 | Map: picking a node shows description, danger, travel cost, services, players there and related quests, with Travel and Travel with party. **Text is stale:** CONTEXT, UI-SPEC and ROADMAP criterion 2 replace "Travel with party" with one Travel button (followers come along under the leader's existing `followLeader` rule). | Shared stamina-cost helper (S1) imported through `@game-data`; keyed `npc` and `character` subscriptions for the selected place; `quest_template` links; `travel_cooldown` rows (own and party); `travelChecks` pure model; Travel button state table in the UI-SPEC. Update the LDG-05 wording in `REQUIREMENTS.md` when the phase completes. |
</phase_requirements>

## Summary

The Map is mostly a client phase with a small, well-bounded server footprint. Everything the UI-SPEC asks for can be built on data that already exists (`location`, `region`, `location_connection`, `travel_cooldown`, `character`, `group_member`, `quest_template`, `npc`) plus **one** new private table (per-character visited places) with a `my_*` view. The server must additionally: share the per-traveller stamina rule with the client (a pure function in `data/travel_config.ts`), teach `look` to describe a neighbouring place and a bind stone, and collapse explored passage nodes (immediately when the last occupant leaves, and through a guarded scheduled sweep that also moves offline occupants back to their own side). No new client-callable mutating reducer is needed: Travel is `move_character`, Bind is `bind_location`, both already exist.

The local database confirms the shapes the code assumes. There are 22 locations, 4 regions and 3 passage nodes (ids 6, 4101, 4107), each connecting exactly one place on its own region's side to one place on the far side, nobody stands in any of them, and `travel_cooldown` carries stale expired rows (so the client must treat a past ready time as Ready). There is no teleport ability and no effect that shortens the cross-region timer today: the only shortening is the renown perk field `travelCooldownReduction` (capped at 80 percent in `performTravel`); the bard song "March of Wayfarers" gives a `travel_discount` that reduces **stamina**, not the timer.

The main implementation risks are (1) the `consoleApi.travel` path closes the open screen and echoes a feed line, so the Map must call `moveCharacter` itself through an action runner; (2) the client subscribes only the exits of the current place today, so the Map hub needs a whole-table `location_connection` binding (consistent with the whole `location` and `region` subscriptions the session already holds); (3) `Drawer.vue` and `Sheet.vue` are being edited right now by plan 50-39 (an `actions` slot), so the Phase 51 `end` slot plan must re-read those files and be sequenced after 50-39; and (4) the passage "own side" for the sweep is not stored anywhere, so the visited row should record where the character arrived from.

**Primary recommendation:** Build it in four layers in this order: (S) server additive changes with real-handler tests, then regenerate bindings; (C1) guard changes and pure `src/map/` helpers with exhaustive unit tests; (C2) a dedicated map hub plus the Map screen, meta chips, detail panel and mobile sheet; (C3) the rail travel panel and the Examine, Talk and bind stone rows. Keep every decision that is a recommendation in this document behind the Assumptions Log so the planner can confirm it with the owner.

## Project Constraints (from CLAUDE.md and project memory)

- SpacetimeDB TypeScript rules apply: reducer calls use object syntax; client handles are camelCase; never edit generated bindings (regenerate with `spacetime generate`); views may only use index lookups, never `.iter()`; scheduled tables use `scheduledId` as the primary key and the function form `scheduled: () => ...`; `ctx.sender` is the authenticated principal; timestamps are objects on the client; do not invent SpacetimeDB APIs; make the smallest change; do not touch unrelated files.
- Every client-visible feature must wire the client to the reducer ("Common mistake: building backend tables/reducers but forgetting to wire up the client").
- Memory: prefer `fail(ctx, character, message)` for player-facing refusals; the server is the source of truth (import mirrored constants through `@game-data`, never duplicate); all phases and quick tasks include unit tests; publish locally only, never maincloud, never `--clear-database` unless the schema requires it (here every change is additive so it is not required); scheduled tables use `scheduledId`.
- Project rules from the task: local publish command `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null` with the `admin_llm_status` key_length 108 check before and after (it is 108 now [VERIFIED: local db query]); no paid LLM calls; any LLM prompt wording needs the owner's explicit approval. **This phase needs no LLM prompt change** (see Open Question 8).
- Design guards enforced by tests: tokens only (pin 23), no `v-html`, `<svg` only in `src/map/` after the O1 change, Phosphor and Inter only, sizes 10/12/14/20, weights 400/500, spacing scale, text nodes only, no `replaceAll`, `.at(` or `Object.hasOwn`, never the word "ripple" (`spacetimedb/src/data/no_ripple_word.test.ts` scans `src` and `spacetimedb/src`, comments included).
- Another agent is executing Phase 50 plans right now (crafting, inventory, salvage). Phase 51 plans must treat shared shell files as additive and re-read them at execution time.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Which places a character knows (visited) | Database / Storage (private `visited_location`) | API / Backend (written in `performTravel`, first spawn, respawn) | Owner decision: recorded on the server so it survives devices and is private per character |
| Heard-of places, known regions, graph layout, route (BFS), node states | Browser / Client (pure helpers in `src/map/`) | — | Owner decision: derived on the client from `location_connection`; layout is deterministic and has no server state |
| Stamina cost per traveller | API / Backend (`performTravel` is authoritative) | Browser (imports the same pure helper via `@game-data`) | Server is the source of truth; the client only mirrors the formula, never the data |
| Cross-region timer (lock and time left) | Database (`travel_cooldown.readyAtMicros`) | Browser (subtracts the server clock; no reduction math) | Reductions (perk) are applied server-side when the row is written |
| Followers coming along, all-or-nothing stamina and timer checks | API / Backend (`performTravel`) | Browser (predicts the same checks from public `group_member`, `character`, `travel_cooldown`) | Client prediction is display only; the server's refusal line is the truth |
| Travel and Bind | API / Backend (`move_character`, `bind_location`) | Browser (buttons) | Existing reducers; no new mutating reducer |
| Look at a neighbouring place and a bind stone | API / Backend (`describeLookTarget`) | Browser (Examine eye sends `look at <name>`) | `look` is an intent handled on the server |
| Passage collapse and offline sweep | API / Backend (helper in `performTravel`, scheduled reducer) | Database (re-pointing rows) | Needs transactional re-pointing of locations, connections, binds, quests |
| Map drawing (SVG plane) | Browser (`src/map/`, the one SVG folder) | — | Guarded, token-only, one coordinate space |
| Region chips, travel pill, unlock status | Browser | — | Pure presentation of server rows |

## Standard Stack

### Core (no new runtime dependency)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vue | ^3.5.43 | Screens and rail components | Project framework [VERIFIED: package.json] |
| spacetimedb | ^2.10.1 | Module SDK and client SDK (`toSql`, `tables`) | Project backend [VERIFIED: package.json, spacetimedb/package.json] |
| @phosphor-icons/vue | 2.2.1 | Icons (regular weight only) | Only allowed icon set; every icon in the UI-SPEC list exists in 2.2.1 and `PhAnvil` does not [VERIFIED: node_modules/@phosphor-icons/vue/dist/index.d.ts grep, 2026-10-07] |

### Supporting (dev/test, already installed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | ^5.0.2 | Unit and component tests, client and server | All tests; one root `npx vitest run` runs both `src/` and `spacetimedb/src/` [VERIFIED: ran two test files from the repo root] |
| @vue/test-utils | 2.5.1 | Mounting components | Component tests (`// @vitest-environment happy-dom`) |
| happy-dom | 20.14.5 | DOM for component tests | No layout engine: size assertions are source-text assertions |
| vue-tsc | ^3.3.11 | Type check (`npm run build` runs `vue-tsc -b`) | Phase gate |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled layered layout in `graphLayout.ts` | d3, dagre, elkjs | Banned: `legacyClientRemoval.test.ts` pins the runtime dependencies to exactly vue, spacetimedb and @phosphor-icons/vue. The layout is a small BFS plus column placement, deterministic and unit-testable |
| New dedicated map hub (`src/map/mapData.ts`) | Extend `src/ledger/ledgerData.ts` | Ledger hub is documented as inventory/vendor/crafting data and 51.1/51.2 will add their own; a per-screen hub keeps each file small. Costs one `Session` field, one `SessionDeps` entry, an `App.vue` provide and reset/dispose wiring. `[ASSUMED]` A5 |

**Installation:** none. No package is added, so no `npm install` and no legitimacy gate.

## Package Legitimacy Audit

No external packages are installed in this phase. `@phosphor-icons/vue` 2.2.1, `vue`, `spacetimedb`, `vitest`, `@vue/test-utils`, `happy-dom` and `vue-tsc` are existing dependencies already in `package.json`. No `npm view`, no postinstall check and no `checkpoint:human-verify` install gate is required.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                           SERVER (SpacetimeDB module, spacetimedb/src)
 Client ──move_character──► performTravel ──┬─ cost via data/travel_config.ts (shared pure helper)
 (Map button,                (helpers/      ├─ all-or-nothing stamina + travel_cooldown checks
  rail Travel/Cross)         travel.ts)     ├─ write character.locationId for leader + followLeader members
                                            ├─ markLocationVisited(char, dest, from)   ──► visited_location (private)
                                            ├─ uncharted dest? ──► startWorldGeneration (LLM job, existing)
                                            └─ origin is a passage and now empty? ──► collapsePassage()
                                                                                         │ re-point binds/quests/events/npcs,
 world_gen stage 1 (llm_apply) ── renames Edge ► 'passage'; moves no one                 │ link own-side ⇄ far-side directly,
                                                                                         │ delete passage + its connections
 scheduled sweep_passages (every N min, module-identity guard) ──► for each 'passage' row: ┘ delete visited rows for it
      online set = player.activeCharacterId ──► offline occupants moved to their own side ──► collapse if empty

 look at <name> ──► describeLookTarget ──► (+ neighbour place, + bind stone) ──► private 'look' line

                                     PUBLIC DATA THE CLIENT READS
 my_visited_locations (view, by active character) ─┐
 location (whole), region (whole) [session]        │
 location_connection (WHOLE, new map hub binding)  ├──► src/map/knownPlaces.ts ──► heard-of set, known regions
 travel_cooldown WHERE character_id IN (me+party)  │            │
 character (me, party), group, group_member,       │            ▼
 my_character_effects, quest_template, my_quests   │   graphLayout.ts (BFS columns, border nodes, gates, box)
 npc WHERE location_id = selected (keyed)          │            │
 character WHERE location_id = selected (keyed)    ┘            ▼
                                              MapScreen: one pixel plane { <svg> border/edges/route,
                                              caption, node buttons + labels, gate pills } + List view
                                                   │ select node ──► DetailPanel ──► travelChecks.ts ──► Travel button
                                                   ▼                                  │ run('travel', moveCharacter)
                                              chips (Drawer meta slot), pill (new `end` slot), legend
 Rail: HereCard ──► exits panel (routesFrom + dangerBand + checks) ──► consoleApi.travel (existing)
       NearbyList ──► Examine eye / Talk / Bind rows ──► consoleApi.examine|hail, game.reducers.bindLocation
```

### Recommended Project Structure

```
spacetimedb/src/
├── schema/tables.ts            # + VisitedLocation, PassageSweepTick (register in schema({...}))
├── data/travel_config.ts       # + travelStaminaCost, travelEffectDiscount (pure, import-free)
├── helpers/visited.ts          # markLocationVisited (upsert), visitedFor
├── helpers/passages.ts         # onlineCharacterIds, isPassageEmpty, passageSides, collapsePassage, sweepPassages
├── helpers/travel.ts           # use shared cost helper; markLocationVisited; collapse trigger on departure
├── helpers/examine.ts          # + neighbour place and bind stone targets
├── views/visited.ts            # my_visited_locations (register in views/index.ts + ViewDeps)
└── reducers/passages.ts        # scheduled sweep_passages (module-identity guard) + admin collapse_passages
src/
├── map/                        # the ONE folder allowed to contain <svg
│   ├── danger.ts terrain.ts travelTimer.ts      # shared with 51.1 and 51.2
│   ├── knownPlaces.ts graphLayout.ts route.ts regionChips.ts travelChecks.ts detailModel.ts
│   ├── mapContext.ts mapData.ts queries.ts      # hub: bindings, selection state, reducers
│   ├── MapScreen.vue MapMeta.vue MapEnd.vue GraphPlane.vue GraphList.vue DetailPanel.vue
│   └── MapLegend.vue MapSheet*.vue              # mobile tabs, dock, regions listbox
├── rails/                      # HereCard.vue becomes the exits panel; NearbyList rows; PartyBlock stamina
└── frame/                      # Drawer.vue and Sheet.vue `end` slot (additive; sequence after 50-39), LocationRow.vue + exit chips
```

Do not name any folder `components`, `composables`, `ui` or `data` (`legacyClientRemoval.test.ts`).

### Pattern 1: Private per-character table plus `my_*` view (server)

**What:** The `vendor_buyback` precedent. Private table, a view that finds the active character through `player` (primary key lookup) and then reads the table through an index.
**When to use:** `visited_location`.
**Example:**
```typescript
// Source: spacetimedb/src/views/vendor_buyback.ts (pattern), spacetimedb/src/views/quests.ts (many rows)
export const VisitedLocation = table(
  { name: 'visited_location', indexes: [
    { accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] },
    { accessor: 'by_location',  algorithm: 'btree', columns: ['locationId'] }, // passage cleanup
  ] },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    locationId: t.u64(),
    firstVisitedAt: t.timestamp(),
    fromLocationId: t.u64().optional(), // where the LAST arrival here came from (passage own-side rule)
  }
);

spacetimedb.view({ name: 'my_visited_locations', public: true }, t.array(VisitedLocation.rowType), (ctx: any) => {
  const player = ctx.db.player.id.find(ctx.sender);
  if (!player?.activeCharacterId) return [];
  return [...ctx.db.visited_location.by_character.filter(player.activeCharacterId)]; // index lookup only
});
```
Register `VisitedLocation` in the `schema({...})` list and in `ViewDeps` (`views/types.ts`, `index.ts` `registerViews({...})`). The generated client handle is `tables.myVisitedLocations` / `conn.db.myVisitedLocations`; view rows use the table row type `VisitedLocation` (view tables are generated with an empty row type, as the existing `useSession`/`context.ts` comments note). `[VERIFIED: codebase]`

### Pattern 2: Scheduled sweep with the module-identity guard

**What:** `sweep_inactivity` and `restock_vendors`. The reducer starts with the guard, does its work, then re-arms itself. `init` does not run on a republish, so a tick is armed from `clientConnected` when none is pending.
**Example:**
```typescript
// Source: spacetimedb/src/index.ts (restock_vendors, ensureVendorRestockScheduled), reducers/scheduled_guard.integration.test.ts
export const PassageSweepTick = table(
  { name: 'passage_sweep_tick', scheduled: () => scheduledReducers['sweep_passages'] },
  { scheduledId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt() }
);
scheduledReducers['sweep_passages'] = spacetimedb.reducer('sweep_passages', { arg: PassageSweepTick.rowType }, (ctx) => {
  if (ctx.sender.toHexString() !== ctx.databaseIdentity.toHexString()) return; // FIRST statement, before any db access
  const now = ctx.timestamp.microsSinceUnixEpoch;
  ctx.db.passage_sweep_tick.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.time(now + PASSAGE_SWEEP_INTERVAL_MICROS) });
  sweepPassages(ctx);
});
```
`scheduled_guard.integration.test.ts` keeps a hand-maintained `SCHEDULED` list and a "forged call cannot fork a second chain" case list; both must gain `sweep_passages`. `[VERIFIED: codebase]`

### Pattern 3: Shared pure stamina-cost helper (server and client)

**What:** Move the duplicated per-traveller math out of `performTravel` (it appears twice, in the validation and the deduction loops) into `data/travel_config.ts`, which has no imports (a `gameDataAlias.test.ts` browser-safety pin should be added for it).
```typescript
// Source: spacetimedb/src/helpers/travel.ts lines 105-119 and 140-150 (current duplicated logic)
export function travelEffectDiscount(effects: readonly { effectType: string; roundsRemaining: bigint; magnitude: bigint | number }[]): bigint {
  return effects.filter(e => e.effectType === 'travel_discount' && e.roundsRemaining > 0n)
    .reduce((sum, e) => sum + BigInt(e.magnitude), 0n);
}
export function travelStaminaCost(a: { crossRegion: boolean; racialIncrease?: bigint | null; racialDiscount?: bigint | null; effectDiscount: bigint }): bigint {
  const base = a.crossRegion ? TRAVEL_CONFIG.CROSS_REGION_STAMINA : TRAVEL_CONFIG.WITHIN_REGION_STAMINA;
  const raw = base + (a.racialIncrease ?? 0n);
  const discount = (a.racialDiscount ?? 0n) + a.effectDiscount;
  return raw > discount ? raw - discount : 0n;
}
```
The cooldown **length** (`CROSS_REGION_COOLDOWN_MICROS` and the perk reduction) stays server-only. The client reads `character.racialTravelCostIncrease/Discount` (public `character` row) and `my_character_effects` (own plus party effects, [VERIFIED: views/effects.ts]).

### Pattern 4: Known places, derived on the client

```typescript
// src/map/knownPlaces.ts (pure; plain lists in, plain lists out)
// visited = my_visited_locations ∪ { character.locationId }   // current place is always visited (UI-SPEC)
// heardOf = { to : (from,to) in connections, from ∈ visited } \ visited
// drawn   = visited ∪ heardOf, restricted to location rows that exist
// knownRegions = regions having ≥ 1 drawn place
```
Outgoing rows from visited places are enough: the server always writes both directed rows (`connectLocations`, helpers/location.ts:44-47) [VERIFIED]. A connection between two heard-of places is not revealed (acceptable and arguably better fog of war). Dedupe edges by the unordered pair.

### Pattern 5: Deterministic layered layout (`graphLayout.ts`)

Follow the UI-SPEC "Route graph" steps exactly. Notes the UI-SPEC leaves to the planner:
- **Root (O2):** the lowest-id **known** place of the shown region with `bindStone`, else the lowest-id known place. Real data confirms start places are the only `bind_stone = true` places per region (ids 1, 4097, 4102, 4108) [VERIFIED: local db query]. The root must come from the known set (a region the player entered only partly known must still lay out). Positions may shift when new places are discovered; that is acceptable and still deterministic.
- Use `String(id)` keys and bigint comparison helpers (never subtraction); ordering ties by `localeCompare(..., undefined, { sensitivity: 'base' })` then id, the same as `routesFrom` in `src/rails/levelRange.ts`.
- Output one object (`nodes`, `edges`, `border`, `gates`, `width`, `height`) that both the SVG and the HTML nodes read, so the "SVG endpoints equal node centers" test is a plain equality on that object.
- Inputs are plain lists, so the later 999.26 layer view can feed a sub-region without changes.

### Pattern 6: Map hub with keyed subscriptions (client)

Follow `src/ledger/ledgerData.ts` and `src/game/keyedBinding.ts` (`createKeyed`, `keyedRows`, `idListKey`, `parseIdListKey`). Every keyed binding passes a filter equal to its SQL (shared-cache rule).

| Binding | SQL | Key | Notes |
|---------|-----|-----|-------|
| `myVisitedLocations` | the view | active character id, swap `'immediate'` | never show the previous character's places after a switch |
| `locationConnection` | whole table | static | consistent with the session's whole `location` and `region`; ~48 rows locally. `game.connections` (exits of the current place) is left untouched |
| `travelCooldown` | `WHERE character_id IN (…)` (OR chain) | id list: me + party members | follower checks; rekeys when the party changes |
| `npc` | `WHERE location_id = X` | selected place id | Services (vendor, banker) |
| `character` | `WHERE location_id = X` | selected place id | Players count (O9 recommendation, see Open Question 4) |
| `npc` by id list | `WHERE id IN (giver ids)` | ids from the player's own active `quest_template` rows | giver location for "Giver here" |

Selection state, `shownRegionId`, view mode and the arrival banner live in the hub (like `setVendor` in the ledger hub) because the chips (drawer `meta` slot), the pill (new `end` slot) and the screen body are sibling components in `AppFrame.vue`. `[ASSUMED]` A5.

### Pattern 7: Map actions do not use `consoleApi.travel`

`ConsoleApi.travel` calls `frame.closeScreen()`, clears the conversation and echoes `go to {place}` into the feed before firing `moveCharacter` (`src/console/useConsole.ts:383-391`). The Map must stay open after travel, so the Map button should call `game.reducers.moveCharacter({ characterId, locationId })` through `createActionRunner` (`src/ledger/actionRunner.ts`) and show refusals in `NoticeLine` (mirrors private `system`, `reward`, `heal` lines; the server's travel refusals are `system` [VERIFIED: appendSystemMessage uses kind 'system']). The **rail** keeps `consoleApi.travel` (desktop rail: no drawer is open; mobile Here tab: closing the sheet reveals the feed, which is what the UI-SPEC wants).

Arrival detection: do not track "my click". Watch `character.locationId`; on any change while the Map is open, select the new place, switch `shownRegionId` if the region changed, show the banner (`Arrived at {place}.` or `Crossed into {Region}. Arrived at {place}.`) and move focus to the detail `h4`. This also covers a typed `go` and a respawn.

### Anti-Patterns to Avoid

- **Computing durations or reductions on the client.** Show `readyAtMicros - game.clock.nowMicros()` only. `game.clock` is the existing server-skew clock (`src/game/serverClock.ts`); the UI-SPEC's "client clock" should be this one.
- **Treating a lingering `travel_cooldown` row as a lock.** Expired rows are only deleted opportunistically on the next cross-region travel (`performTravel` lines 129-136), and the local database holds one now (character 4097) [VERIFIED: local db query]. A past ready time means Ready; with several rows use the largest ready time.
- **Using `routeLevel` order for uncharted.** `routeLevel` returns `{ safe: true }` for any `isSafe` place and the uncharted edge and passages are inserted `isSafe: true` (`world_gen.ts:887-902`, local data). `dangerBand` must test `terrainType === 'uncharted'` **before** `isSafe`.
- **Reading `terrainType` strings from the LLM as an enum.** The generator enum is `mountains, woods, plains, swamp, dungeon, town, city`; `uncharted` and `passage` are engine values. Unknown values fall back to `PhMapPin` (UI-SPEC).
- **Adding `<svg` outside `src/map/`.** Phosphor components render SVG at runtime; the guard only reads `.vue` template/script text, so icons are fine.
- **Editing `Drawer.vue` and `Sheet.vue` before 50-39 lands.** See Pitfall 7.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-traveller stamina cost | A second copy of the formula in `src/map/` | `travelStaminaCost` in `spacetimedb/src/data/travel_config.ts`, imported through `@game-data/travel_config`, used by `performTravel` too | Two copies drift; `vendor_pricing_parity.test.ts` shows the project's parity-test habit |
| Feed-line refusals in a drawer | A new toast or error system | `NoticeLine.vue` plus `createActionRunner` from `src/ledger/` | Exact Phase 50 rule; already tested |
| Tabs (Graph or List, Map or Here) | New tab markup | `SegTabs.vue` (`src/ledger/`) | Nocturne `.seg` and keyboard handling exist |
| Empty states | New markup | `src/screens/EmptyState.vue` | Reused by the Map empty state |
| Subscriptions | Direct `conn.subscriptionBuilder()` calls | `bindTable`, `createKeyed`, `idListKey` | Reconnect, swap and shared-cache behaviour is already solved |
| Focus trapping and Esc | Custom handlers | `Drawer.vue`/`Sheet.vue` + `src/frame/focusTrap.ts` | The 45 tab-order rules and tests |
| Timers | `setInterval` per component | One shared 1-second tick composable that only ticks while a seconds timer is visible; minute timers every 60 seconds | The UI-SPEC rule; `WorldEventCard.vue` and `useCooldownTicker.ts` are the precedents |
| Pathfinding | A graph library | Breadth-first search (a few lines) in `route.ts` | The dependency list is pinned; BFS over ≤ hundreds of nodes |
| Online check for the sweep | A new presence system | A set of `player.activeCharacterId` over `ctx.db.player.iter()` | Phase 51.1 adds a stored online flag later; the helper is one function to swap |
| Danger colour | A third colour rule | `dangerBand` in `src/map/danger.ts` (the Map rule), separate from `conFor` (48) | Two rules exist on purpose (UI-SPEC) |

**Key insight:** Nearly all risk is in the seams (subscriptions, shell slots, passage re-pointing, guards), not in the drawing. Spend plan budget on the seam tests.

## Runtime State Inventory (passage collapse is a data migration of the existing world)

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Local `location` has 3 passage rows: id 6 (region 1; connects 5 (own side, dungeon, region 1) and 4097 (far side)), id 4101 (region 4097; connects 4099 (own) and 4102 (far)), id 4107 (region 4098; connects 4106 (own) and 4108 (far)). Nobody stands in any of them. `character`, `quest_template.targetLocationId/sourceLocationId`, `quest_item`, `named_enemy`, `search_result`, `npc`, `resource_node`, `enemy_spawn`, `corpse`, `pull_state`, `combat_encounter`, `event_objective`, `event_spawn_enemy`, `enemy_respawn_tick`, `location_enemy_template`, `vendor_buyback`, `world_gen_state.sourceLocationId`, `world_state.startingLocationId` and `character.boundLocationId` can all hold a location id [VERIFIED: schema/tables.ts grep and local db query] | Data migration: the first sweep tick collapses every empty passage (idempotent). Code edit: `collapsePassage` re-points or deletes dependents (list in Pitfall 5) |
| Live service config | None: no external service stores a location id. The LLM job queue carries `contextJson` with ids only for in-flight jobs; a collapsed passage is never the source of an unfinished generation because the rename happens in stage 1 success | None (verify no `world_gen_state` is `PENDING`/`GENERATING` for the passage before the first publish) |
| OS-registered state | None: no OS task references locations | None |
| Secrets/env vars | None. The `admin_llm_status` key (length 108) is untouched; never `--clear-database` | Keep the 108 check before and after the local publish |
| Build artifacts / installed packages | `src/module_bindings/` must be regenerated for the new table, view and scheduled table (`npm run spacetime:generate`); never edit it by hand | Regenerate after the server plans |

Separately, **characters that exist today have no visited rows.** The client unions the view with `character.locationId`, so the map still works (current place plus its neighbours). A backfill is not required (greenfield rule), but upserting the current place on `set_active_character` is a cheap optional addition (Open Question 6).

## Common Pitfalls

### Pitfall 1: The `look` neighbour target collides with existing categories
**What goes wrong:** A neighbouring place and an NPC, enemy or node can share a name. `describeAll` returns the first hit in the order NPC, enemy, player, node, item, and an exact pass runs over every category before the partial pass.
**Why it happens:** `describeLookTarget` has no notion of places.
**How to avoid:** Add the neighbour place (and a pseudo `bind stone` target) as **late** categories inside `describeAll`, so existing exact-name behaviour is unchanged and a place only answers when nothing local does. Put `bind stone` before nodes only if its exact name `bind stone` is matched exactly; a plain `Stone` node must still win `look at stone`. Cover with real-handler tests in `look_intent.test.ts` style.
**Warning signs:** `look_intent.test.ts` or `examine.test.ts` changing expected output for existing targets.

### Pitfall 2: `performTravel` is all-or-nothing and the client prediction must mirror it
**What goes wrong:** The button says Travel but the server refuses because a follower is short on stamina or on cooldown.
**Why it happens:** Followers are the leader's `group_member` rows with `followLeader` at the **same origin location**, only when the mover is the group leader by `group.leaderCharacterId` (not by `role`) [VERIFIED: travel.ts:79-103]. Gathering and combat are checked for the initiator only.
**How to avoid:** `travelChecks.ts` is a pure function of (character, group, members, characters, effects, cooldown rows, clock, destination). Test the blocking order in the UI-SPEC (gathering, own timer, follower timer, own stamina, follower stamina). Always keep the server refusal path: the notice line shows the server's own line.

### Pitfall 3: Cross-region cost applies to the passage edge too, and the collapse changes it
**What goes wrong:** Costs shown today for A → passage (5, same region) and passage → S (10 plus the timer) change to A → S (10 plus the timer) after the collapse. The first Travel after a collapse costs more than the two-step path did on stamina side (10 vs 5 + 10 = 15 stamina but one timer) and the UI must not cache.
**How to avoid:** Derive every cost from `regionId` of the two location rows at render time (`isCrossRegion = from.regionId !== to.regionId`), never from terrain labels.

### Pitfall 4: A passage collapse races with arrival
**What goes wrong:** The last occupant leaves, the passage collapses in the same transaction, and a **follower** who is still moving or a second traveller targets the deleted row.
**Why it happens:** `performTravel` moves leader and followers in one loop; the check must run once, **after** the loop, per distinct origin.
**How to avoid:** `collapsePassageIfEmpty(ctx, originLocationId)` after the move loop, using `ctx.db.character.by_location.filter(origin)` to prove emptiness. A traveller who targets a deleted passage gets `Location not found` from the existing first check; the client redraws from the row deletion.

### Pitfall 5: Re-pointing on collapse is wider than "binds, quests and events"
**What goes wrong:** Orphaned ids in tables that reference the deleted location.
**How to avoid:** One helper re-homes (to the own-side neighbour with the lowest id) or deletes, with a test per row type:
- re-point: `character.boundLocationId`, `quest_template.targetLocationId`, `quest_template.sourceLocationId` (delivery quests pick a **neighbour of the giver** as the pickup, `llm_apply.ts:807-816`, so the pickup can be the edge), `quest_item.locationId`, `named_enemy.locationId`, `corpse.locationId`, `event_objective.locationId`, `npc.locationId`, `vendor_buyback.locationId`;
- delete: `search_result` rows, `resource_node`, `enemy_spawn`, `location_enemy_template`, `enemy_respawn_tick`, `pull_state` rows at the passage, `visited_location` rows at the passage (use the new `by_location` index);
- leave: `world_gen_state.sourceLocationId` (history only; its last use is the stage-1 connect) and `world_state.startingLocationId`.
The edge is `isSafe: true` with `bindStone: false`, so binds, enemies and nodes are unlikely, but the helper must be total because the LLM controls quest pickup choice.

### Pitfall 6: The sweep's "own side" is not stored
**What goes wrong:** An offline explorer in the passage must go back to the neighbour on their own side, never across the border. Without a record, a character who crossed from the far side would be moved to the passage's region side.
**How to avoid:** Record where the last arrival came from on the visited row (`fromLocationId`). The sweep picks `fromLocationId` when it is a current neighbour of the passage; otherwise the own-region neighbour with the lowest id (the passage's `regionId` is the **source** region: the boundary is created with `regionId: region.id` of the region it ends, `world_gen.ts:887-902`, and renamed in place, so own side = neighbours with `regionId === passage.regionId`). Existing characters have no record; the fallback covers them. `[ASSUMED]` A1.

### Pitfall 7: Shell files are being edited by Phase 50 plan 50-39
**What goes wrong:** A merge or overwrite of `Drawer.vue`/`Sheet.vue` while 50-39 adds an `actions` slot.
**How to avoid:** Sequence the `end`-slot plan after 50-39, re-read both files at execution time, and keep the change additive (a new named slot between the spacer and the close button, test that the close button stays the first focusable element after the meta slot). `git status` at research time shows only `src/crafting/*` modified [VERIFIED]. Also: today `drawer-meta` is an inline `<span>` and `Sheet.vue` renders `<slot name="meta" />` bare, so the chips need `display: flex; flex-wrap: wrap; gap: 4px; min-width: 0` on the meta container (UI-SPEC "Layout Contract").

### Pitfall 8: Passages and the uncharted edge look the same to `isSafe` but differ for the player
**What goes wrong:** Travelling onto an uncharted edge starts a paid world generation. The Map's `Travel to The Edge Beyond X` button is a real LLM spend.
**How to avoid:** No automated test may reach `startWorldGeneration` for real (mock it, as `llm_apply.test.ts` does); UAT of this path is part of the deferred milestone UAT, and the UI-SPEC note `Travelling here opens a new region.` stays on the button.

### Pitfall 9: `ConsoleApi.examine` has no bare-look form
**What goes wrong:** The Here-card eye must send a bare `look`; `examine(name)` always sends `look at {name}`.
**How to avoid:** `parseLookCommand` already treats `look at` with nothing after as a bare look [VERIFIED: examine.ts:14-22], but a clean approach is a new `ConsoleApi.look()` that sends `look`. Add it to the `ConsoleApi` interface and the inert console in `context.ts`.

### Pitfall 10: `GameReducers` lacks `bindLocation`
**What goes wrong:** `game.reducers` returns the full generated `conn.reducers` at runtime but the TypeScript interface (`src/game/context.ts`) does not list `bindLocation`, so a call fails type checking (`vue-tsc -b` is in `npm run build`).
**How to avoid:** Add `bindLocation(a: { characterId: bigint }): Promise<void>` to `GameReducers` and to the inert game. Note `effectChipsGuards.test.ts` scans `context.ts`, `gameData.ts` and `queries.ts` for literal colors, `<svg`, `replaceAll`, `.at(`; keep those files clean. `bind_location` has no combat check (the typed `bind` intent does); the rail never shows Nearby in combat, so this is a hardening note, not a blocker (Open Question 8).

### Pitfall 11: happy-dom cannot measure or scroll
**What goes wrong:** Tests that assert "44px measured", `scrollIntoView` or `matchMedia` behaviour fail or throw.
**How to avoid:** Assert min-height from the component source text (as `ReagentPicker.test.ts` does), guard `scrollIntoView`/`scrollTo`/`matchMedia` with optional calls, and keep true layout checks (20-place region at 1280 and 900, 390x844) as deferred manual UAT. The project defers UAT to the milestone end (memory).

### Pitfall 12: Test-only gotchas on the server mock
**What goes wrong:** Strict mock db throws on unknown tables or index accessors; recorded schema must contain `visited_location` and `passage_sweep_tick`.
**How to avoid:** Define the tables in `schema/tables.ts` before writing tests; use the Phase 46.1 fixtures (`helpers/combat_fight_fixture.ts`: `fightCtx`, `T0`, `ALICE`, `BOB`, `MODULE`, `rows`) and `capturedReducer('move_character')` after `await import('../index')` under the recording `spacetimedb/server` mock, as in `combat_choices.integration.test.ts` and `look_intent.test.ts`.

## Code Examples

### Collapse a passage (server sketch)

```typescript
// helpers/passages.ts
// Source: composed from helpers/location.ts connectLocations, helpers/travel.ts, helpers/world_gen.ts (shapes verified)
export function passageSides(ctx: any, passage: any) {
  const own: any[] = []; const far: any[] = [];
  for (const c of ctx.db.location_connection.by_from.filter(passage.id)) {
    const loc = ctx.db.location.id.find(c.toLocationId);
    if (!loc) continue;
    (loc.regionId === passage.regionId ? own : far).push(loc);
  }
  own.sort((a, b) => (a.id < b.id ? -1 : 1)); far.sort((a, b) => (a.id < b.id ? -1 : 1));
  return { own, far };
}

export function collapsePassageIfEmpty(ctx: any, passageId: bigint): boolean {
  const passage = ctx.db.location.id.find(passageId);
  if (!passage || passage.terrainType !== 'passage') return false;
  if ([...ctx.db.character.by_location.filter(passage.id)].length > 0) return false;
  const { own, far } = passageSides(ctx, passage);
  if (own.length === 0 || far.length === 0) return false; // nothing to link: keep the passage
  rehomePassageDependents(ctx, passage, own[0]);           // Pitfall 5
  for (const row of [...ctx.db.location_connection.by_from.filter(passage.id)]) ctx.db.location_connection.id.delete(row.id);
  for (const row of [...ctx.db.location_connection.by_to.filter(passage.id)]) ctx.db.location_connection.id.delete(row.id);
  for (const a of own) for (const b of far) if (!areLocationsConnected(ctx, a.id, b.id)) connectLocations(ctx, a.id, b.id);
  for (const v of [...ctx.db.visited_location.by_location.filter(passage.id)]) ctx.db.visited_location.id.delete(v.id);
  ctx.db.location.id.delete(passage.id);
  return true;
}
```

### Mark a place visited (server)

```typescript
// helpers/visited.ts
export function markLocationVisited(ctx: any, characterId: bigint, locationId: bigint, fromLocationId?: bigint): void {
  const existing = [...ctx.db.visited_location.by_character.filter(characterId)].find((r: any) => r.locationId === locationId);
  if (existing) {
    if (existing.fromLocationId !== fromLocationId) ctx.db.visited_location.id.update({ ...existing, fromLocationId });
    return;
  }
  ctx.db.visited_location.insert({ id: 0n, characterId, locationId, firstVisitedAt: ctx.timestamp, fromLocationId });
}
```
Call sites (all places a character's `locationId` is set, [VERIFIED: grep]): `helpers/travel.ts` `moveOne` (pass `originLocationId`), `helpers/llm_apply.ts` first spawn (~line 534), `helpers/world_gen.ts:345` (reuse of an existing starter region), the two respawn paths (`helpers/character.ts:266`, `reducers/characters.ts:298`) and `executeResurrect` (`helpers/corpse.ts`). Respawn and resurrect pass no `from`.

### Timer read (client)

```typescript
// src/map/travelTimer.ts (pure)
export function travelTimer(rows: readonly { readyAtMicros: bigint }[], nowMicros: number): { running: boolean; secondsLeft: number } {
  let latest = 0n;
  for (const r of rows) if (r.readyAtMicros > latest) latest = r.readyAtMicros;
  const left = Number(latest) - nowMicros;                  // microseconds
  return left > 0 ? { running: true, secondsLeft: Math.ceil(left / 1_000_000) } : { running: false, secondsLeft: 0 };
}
```
The caller passes `game.clock.nowMicros()` and re-renders on the shared 1-second tick only where `m:ss` shows.

### SVG plane (one coordinate space)

```vue
<!-- src/map/GraphPlane.vue: the only place an <svg is allowed -->
<div class="graph-plane" :style="{ width: layout.width + 'px', height: layout.height + 'px' }">
  <svg :width="layout.width" :height="layout.height" :viewBox="`0 0 ${layout.width} ${layout.height}`" aria-hidden="true">
    <rect class="border" :x="layout.border.x" :y="layout.border.y" :width="layout.border.w" :height="layout.border.h" rx="24" />
    <line v-for="e in layout.edges" :key="e.key" class="edge" :class="e.kind" :x1="e.x1" :y1="e.y1" :x2="e.x2" :y2="e.y2" />
    <polyline v-if="route" class="route" :points="route" />
  </svg>
  <!-- caption, node buttons (left/top = x - hit/2), labels, gate pills share the same pixel plane -->
</div>
<style scoped>
.edge { stroke: var(--color-neutral-700); stroke-width: 1; vector-effect: non-scaling-stroke; }
.edge.cross { stroke: var(--color-accent-600); stroke-width: 2; stroke-dasharray: 6 4; }
.route { fill: none; stroke: var(--color-accent); stroke-width: 2; vector-effect: non-scaling-stroke; }
.border { fill: color-mix(in srgb, var(--color-accent-900) 35%, transparent); stroke: var(--color-neutral-600); stroke-dasharray: 6 4; vector-effect: non-scaling-stroke; }
</style>
```
Colors only through classes and `var(--…)`; the literal-color guard scans SVG attributes too. Inline `:style` for pixel positions is already used by other components (HostileCard, ReagentPicker), so it is allowed.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Multi-column index prefix scans unsafe | Prefix scans work from SDK 2.7, composite range from 2.8 | SpacetimeDB 2.7/2.8 | A composite `(characterId, locationId)` index is now possible for visited rows; a single `by_character` index plus an in-memory match is simpler for ≤ hundreds of rows [CITED: project CLAUDE.md "Multi-column indexes"] |
| Generated table handles snake_case | camelCase handles (`conn.db.myVisitedLocations`); snake_case are deprecated aliases | 2.7.0 | Use camelCase only (`legacyClientRemoval.test.ts` enforces it) |
| 47 Here card: row click travels | 12a exits panel: row click expands, travel happens on the inner button | Phase 51 UI-SPEC | The existing `HereCard.vue` and its tests change materially |
| 45 design guard: no `<svg` anywhere | `<svg` allowed in `src/map/` only | Phase 51 (owner) | `designContract.test.ts` "no .vue template draws an inline svg" gains one allowed folder |

**Deprecated/outdated:**
- `game.connections` as the map's data source: it is only the exits of the current place (`queries.connectionsFrom`).
- The first-draft UI-SPEC pieces (CSS-rotated edges, two travel buttons): superseded and listed in the UI-SPEC "Supersedes" table.

## Findings Answering the Open Items (O1 to O10)

| Item | Finding |
|------|---------|
| O1 SVG guard | Change `src/styles/designContract.test.ts` line ~251: filter offenders to files not under `src/map/`; add a fixture-style test that a `.vue` outside `src/map/` containing `<svg` is flagged and one inside is allowed. `colors.guard.test.ts` already scans every `.vue` including `src/map/`. [VERIFIED] |
| O2 Graph root | Recommended rule above (lowest-id known `bindStone` place, else lowest-id known place). Local data matches (every region's start is the only bind stone) [VERIFIED] |
| O3 Teleport | **None exists.** `teleport` appears only in `helpers/corpse.ts` (resurrection moves the target to the corpse). The ability kind `travel` exists (`mechanical_vocabulary.ts:88`, `helpers/combat.ts:993`) but only applies a self buff with a default effect type of `damage_up`; the only effect `performTravel` reads is `travel_discount` (stamina). No far-travel action is built; the far-place note stays text only [VERIFIED: grep] |
| O4 Shared cost helper | Pattern 3. Add a `gameDataAlias.test.ts` pin that `travel_config.ts` imports nothing, plus a parity test (server `performTravel` result equals the helper for racial and effect cases) |
| O5 Look targets | Pitfall 1. `describeAll` order today: NPC, enemy, player, node, item. Add neighbour places (via `location_connection.by_from` of the current place) and the `bind stone` pseudo-target late. Bind stone text must say whether the character is bound here (`character.boundLocationId === location.id`) |
| O6 Collapse and sweep | Pattern 2, Code Example and Pitfalls 4 to 6. The sweep also collapses every existing empty passage on its first tick, which satisfies "cleaned up once" without a separate step; an admin `collapse_passages` reducer (`requireAdmin`) running the same function is a cheap explicit alternative |
| O7 `end` slot | Pitfall 7. Add `<slot name="end" />` between `drawer-spacer` and the close button; `ScreenDef` gains an optional `end` component and `AppFrame.vue` renders `#end`; mobile `Sheet.vue` renders the pill inside the Map screen body instead |
| O8 Guard tests | `frameContract.test.ts` line 92 regex adds `map`; update `screens.test.ts` (placeholder copy and the Map having a `meta`/`end`), `AppFrame.screens.test.ts` (placeholder at lines ~111-116 and ~343-391), `railsShell.test.ts` (still three bare sections), `nearby.test.ts`, `keywords.test.ts` / `keywordLabel` test, `levelRange.test.ts` stays |
| O9 Players at a place | Keyed `character WHERE location_id = X` for the selected place; count excludes yourself. It counts offline characters until Phase 51.1 adds the stored online flag; when 51.1 lands the same helper filters by it. A server-side per-location count view is not needed |
| O10 Keyword label | `src/console/keywordLabel.ts` `VERBS.npc: 'Hail'` becomes `'Talk to'`; the typed `hail` command is unchanged |

## Shared pieces Phases 51.1 and 51.2 will build on

- `src/map/danger.ts`, `terrain.ts`, `travelTimer.ts` (UI-SPEC "Shared pure helpers").
- `data/travel_config.ts` cost helper (51.1 party stamina warning).
- `onlineCharacterIds(ctx)` in `helpers/passages.ts` (or a neutral `helpers/online.ts`): 51.1 replaces its body with the stored online flag; name it for reuse.
- `Drawer.vue`/`Sheet.vue` `end` slot, `ScreenArgs` extended with `{ locationId?, regionId? }` and `AppFrame.vue` keeping args for `map` (51.2 "Travel there" opens `openScreen('map', { locationId })`).
- The map hub pattern (`mapContext.ts`, `mapData.ts`, `queries.ts`) as the template for `src/social/` and `src/events/` hubs.
- `GameReducers` gains `bindLocation` here; 51.1 adds `setFollowLeader`, `setGroupPuller` and the friend reducers to the same interface.
- `frameContract.test.ts` allow-list: 51 adds `map`; 51.1 adds `social`, 51.2 adds `events`.
- `ConsoleApi.look()` (bare look) and the NPC `Talk to` label.

## Suggested Plan Decomposition (discretion; the planner decides)

Server (additive, one local publish after the server plans, then regenerate bindings):
1. Shared cost helper + `performTravel` refactor + parity and alias tests.
2. `visited_location` table, `markLocationVisited` at all call sites, `my_visited_locations` view and tests.
3. Neighbour-place and bind-stone look targets and tests.
4. `helpers/passages.ts` (`collapsePassageIfEmpty`, re-home, own-side rule) + departure trigger in `performTravel` + tests on real handlers (seed the local world's three passage shapes).
5. `passage_sweep_tick` + `sweep_passages` + arming in `init` and `clientConnected` + `scheduled_guard` test entries + optional admin `collapse_passages` + tests.
6. Local publish with the 108 key checks, `npm run spacetime:generate`, commit bindings (a task of its own).

Client:
7. Guards: SVG folder, `frameContract` regex, new guard tests (no UI yet).
8. Pure helpers with exhaustive tests: `danger`, `terrain`, `travelTimer`, `knownPlaces`, `route`, `graphLayout`, `regionChips`, `travelChecks`, `detailModel`.
9. Map hub (`mapContext`, `mapData`, `queries`) + session and `App.vue` wiring + tests.
10. `Drawer`/`Sheet` `end` slot, `ScreenDef.end`, `ScreenArgs` for `map` (after 50-39).
11. Graph plane, nodes, gates, legend, keyboard, List view.
12. Detail panel, checklist, Travel button, banner, notice line.
13. Region chips (meta) and travel pill (end), unlock status.
14. Mobile Map sheet (tabs, Regions listbox, legend disclosure, dock, Details).
15. Rail exits panel (`HereCard`), mobile `LocationRow` and exit chips.
16. Rail rows: Examine eye, Talk, bind stone row, keyword label, `HostileCard` row eye, `GameReducers.bindLocation`, `ConsoleApi.look`.
17. `PartyBlock` stamina text and low mark.
18. Placeholder-test updates, full guard run, docs (LDG-05 text).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The visited row records `fromLocationId` and the sweep uses it (fallback: lowest-id own-region neighbour) to decide a character's "own side" | Pitfall 6, Pattern 1 | A character who crossed from the far side could be moved to the wrong side; owner may prefer another rule (for example the bound location's region) |
| A2 | Do not collapse inside `applyWorldStartResult`; leave an unoccupied freshly renamed passage to the next sweep tick (or the next departure) so `llm_apply` characterization tests stay valid | Architecture, Open Question 2 | A passage nobody stands in persists up to one sweep interval after generation; harmless but visible on the map for that time |
| A3 | Sweep interval 5 minutes (matches `sweep_inactivity`); "offline" means no `player` row has that `activeCharacterId` (the existing 30 second disconnect grace and the 15 minute AFK camp already clear it) | Pattern 2 | Too long a wait to clean up, or a returning player is moved sooner than expected. Interval is a constant, easy to change |
| A4 | The Map's Players count comes from a keyed `character WHERE location_id` subscription for the selected place and includes offline characters until 51.1 adds the online flag | Pattern 6, O9 | Count can look higher than who is actually online during 51 |
| A5 | A dedicated `src/map/` hub (`mapData.ts`) rather than extending the ledger hub; selection, shown region and banner state live in that hub | Pattern 6 | Slightly more session wiring; alternative is acceptable |
| A6 | The Map calls `game.reducers.moveCharacter` through `createActionRunner` (not `consoleApi.travel`) | Pattern 7 | If the owner wants the `go to X` echo in the feed, use `consoleApi.travel` and accept that it closes the screen |
| A7 | Whole-table `location_connection` subscription in the map hub | Pattern 6 | World growth could make it large; a server view limited to visited and heard-of ids is the future fix (the table is ~48 rows now) |
| A8 | Upserting the current place on `set_active_character` as a backfill for existing characters is optional | Runtime State Inventory | Existing characters re-discover places as they walk; no data loss |
| A9 | `look at {neighbour place}` text is plain deterministic server copy (name and description, no Keeper voice, no LLM) | Findings O5 | Owner may want to approve the wording; flagged in Open Question 8 |
| A10 | The region chip level range uses only known places and excludes safe places from the min/max (a region whose known places are all safe shows `Safe`) | Region chips | Range may differ from the owner's mental model if CONTEXT meant every place in the region; UI-SPEC wording supports known-only |

## Open Questions (RESOLVED)

1. **Own side for offline characters in a passage (A1).**
   - What we know: nothing stores where a character came from; the explorer comes from the passage's own region side; a crosser from the far side would be misplaced by the region-side fallback.
   - What's unclear: whether the owner wants the extra `fromLocationId` field.
   - Recommendation: store it on the visited row (cheap, already written on every arrival).
   - RESOLVED: `visited_location.fromLocationId` (optional) records where the last arrival came from; 51-01 Task 2 writes it on every move (respawn, resurrection, first spawn and the backfill pass no origin). The sweep in 51-03 Task 2 sends an offline character in a passage to that place when it is an own-side neighbour of the passage (same regionId), else to the lowest-id own-side neighbour, never across the border (coordinator decision 1). Listed as owner-review item A1 in the 51-11 phase-gate SUMMARY.
2. **Collapse timing after generation (A2).**
   - What we know: the passage is renamed in `applyWorldStartResult`; characterization tests at `llm_apply.characterization.test.ts:1120` and `llm_apply.test.ts:946` expect the renamed passage to exist.
   - Recommendation: no immediate collapse there; the sweep and the departure trigger cover it.
   - RESOLVED: no collapse inside `applyWorldStartResult` (51-03 coordinator decision 2). The departure trigger `collapsePassageIfEmpty(ctx, originLocationId)` after the move loop (51-03 Task 1) and the guarded sweep (51-03 Task 2) cover it, so a freshly renamed, unoccupied passage lasts at most one sweep interval and the llm_apply characterization tests are unchanged (51-01 adds new spawn-path tests rather than editing pinned snapshots).
3. **One-time cleanup of the three local passages.**
   - What we know: all three are empty; the first sweep tick collapses them.
   - Recommendation: rely on the sweep; add the admin reducer only if the owner wants an explicit button.
   - RESOLVED: the sweep's first tick is the one-time cleanup; `ensurePassageSweepScheduled` arms it in `init` and `clientConnected` (51-03 Task 2). No admin reducer and no new client-callable mutating reducer is added (51-03 planner decision). 51-03 Task 3 records the passage rows before and after the local publish without connecting a client to force the tick.
4. **Players count semantics until 51.1 (A4).** Recommendation: count characters at the place excluding yourself; switch to online-only in 51.1.
   - RESOLVED: the destination detail's Players line counts the characters at the place other than you, including offline characters, until Phase 51.1 adds the stored online flag (51-05 Task 2 `buildDetail`, coordinator decision 3; the keyed `character WHERE location_id` subscription for the selected place is in the 51-07 map hub). On the server, `onlineCharacterIds` in `helpers/online.ts` (51-03 Task 1) is the single body 51.1 swaps. Listed as owner-review item A4 in the 51-11 SUMMARY.
5. **Seconds timer cost.** A 1-second tick only while a seconds timer is on screen. Recommendation: one shared composable in `src/map/` (also reusable by 51.2).
   - RESOLVED: 51-07 Task 1 adds `createSecondsTick` in `src/map/secondsTick.ts`, a 1000 ms server-clock tick that runs only while its `active` ref is true and is cleared on scope dispose. It lives in the dedicated `src/map/` hub (`mapContext.ts`, `mapData.ts`, `queries.ts`; coordinator decision 4, research A5), which 51.1 and 51.2 reuse as their hub template.
6. **Backfill for existing characters (A8).** Recommendation: upsert current place at `set_active_character`, optional.
   - RESOLVED: adopted, not optional. 51-01 Task 2 marks the character's current place visited (no origin, never touching an existing fromLocationId) in `set_active_character`, and every move also inserts the origin when it has no row, so characters that existed before this phase see their place at once (coordinator decision 5).
7. **LDG-05 text is stale in `REQUIREMENTS.md`.** Recommendation: edit the line to "one Travel button; followers with Follow leader on come along" when the phase completes (ROADMAP criterion 2 already says this).
   - RESOLVED: 51-11 Task 2 edits only the LDG-05 line in `.planning/REQUIREMENTS.md` (one scoped Edit) to the one-Travel-button wording with followers who have Follow leader on coming along; the checkbox state and the traceability table are unchanged.
8. **No LLM prompt wording is needed.** The neighbour and bind stone look lines are server copy, not Keeper text. Flag for owner glance only if they want to review that copy; do not write any prompt.
   - RESOLVED: no prompt is written or changed. 51-01 Task 3 adds the neighbour-place and bind stone look lines as plain deterministic server copy (51-01 prohibition: no LLM prompt, Keeper text or route block change), and the 51-11 phase-gate SUMMARY lists the copy as owner-review item A9 for the end-of-milestone UAT.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | Client and server tests, build | yes | v22.23.2 | none needed |
| npx vitest | All tests | yes | 5.0.2 (ran two test files, 69 tests pass, 841 ms) | none needed |
| spacetime CLI | Local publish, bindings generation, read-only SQL | yes | commit 3d76070 | none needed |
| Local SpacetimeDB | Publish and `spacetime sql` checks | yes (running; `spacetime sql uwr ... --server local` answered) | — | do not stop it; owner's server |
| `admin_llm_status` key | Publish safety gate | yes, `key_length = 108`, `key_set = true` | — | abort publish if not 108 |
| Vite dev server | Manual check | owner's (port 5173) | — | do not stop it |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none. Real-browser 390x844 checks have no automated runner in the repo (no Playwright); they are deferred manual UAT, or a `claude-in-chrome`/`run-local` skill pass by the owner.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 5.0.2 (client and server share the root run), @vue/test-utils 2.5.1, happy-dom 20.14.5 |
| Config file | none dedicated: `vite.config.ts` (alias `@game-data`), per-file `// @vitest-environment happy-dom`; server has `spacetimedb/package.json` `"test": "vitest run"` |
| Quick run command | `npx vitest run src/map src/rails src/frame spacetimedb/src/helpers/travel spacetimedb/src/helpers/passages spacetimedb/src/helpers/examine` |
| Full suite command | `npx vitest run` (ignore the three baseline failures: `scripts/llm/call_log_report.test.mjs`, `scripts/llm/proof_rules.test.mjs`, `spacetimedb/src/helpers/measurement.results.test.ts`) plus `npx vue-tsc -b` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LDG-04 | Visited upsert, from-location, my view returns only the active character's rows | server unit (strict mock) | `npx vitest run spacetimedb/src/helpers/visited.test.ts spacetimedb/src/views/visited.test.ts` | Wave 0 |
| LDG-04 | Known places: visited union current, heard-of from connections, known regions | unit | `npx vitest run src/map/knownPlaces.test.ts` | Wave 0 |
| LDG-04 | Layout: determinism, BFS columns, in-column order, extra columns, border nodes, border box, gate points, edge dedupe, SVG endpoints equal node centers | unit | `npx vitest run src/map/graphLayout.test.ts` | Wave 0 |
| LDG-04 | Node states, legend (Swamp, node-state group), band boundaries at -2/0/2, Safe, Unknown, node aria-label, List rows in layout order, roving tabindex | unit + component | `npx vitest run src/map/danger.test.ts src/map/MapScreen.test.ts` | Wave 0 |
| LDG-04 | Region chips: level range, `Safe`, order, `aria-pressed`, `PhMapPin`; timer locks from the server row (no `5:00`), unlock status once, no level lock | unit + component | `npx vitest run src/map/regionChips.test.ts src/map/travelTimer.test.ts` | Wave 0 |
| LDG-04 | Passage node while its row exists; row deleted and direct connection inserted gives a gate pill; lost selection returns to your place | component | `npx vitest run src/map/passageRedraw.test.ts` | Wave 0 |
| LDG-04 | Passage collapse (empty, occupied, both directions, followers, dependents re-pointed, no far side keeps it), sweep moves offline to own side then collapses, online occupant blocks, forged call rejected | server real-handler | `npx vitest run spacetimedb/src/helpers/passages.test.ts spacetimedb/src/reducers/passage_sweep.integration.test.ts spacetimedb/src/reducers/scheduled_guard.integration.test.ts` | Wave 0 (guard test exists; add entries) |
| LDG-05 | Cost helper equals `performTravel` for racial and effect cases; client import through `@game-data` | server + alias | `npx vitest run spacetimedb/src/data/travel_config.test.ts spacetimedb/src/helpers/travel.test.ts src/gameDataAlias.test.ts` | Wave 0 (alias test exists; add pin) |
| LDG-05 | Detail model: services from NPC types (no trainer or inn), tags, players count, related quests by giver, target and source, heard-of and uncharted variants, crossing block only for other-region neighbours | unit | `npx vitest run src/map/detailModel.test.ts` | Wave 0 |
| LDG-05 | Travel checks and button states: blocking order, follower counting only when leading, labels, far place `Select first stop` only selects, no path, your place, offline | unit | `npx vitest run src/map/travelChecks.test.ts` | Wave 0 |
| LDG-05 | Travel calls `moveCharacter` with object args via the action runner; after travel: new place selected, region switched, banner, focus on `h4`; no `Travel alone` or `Travel with party` text | component | `npx vitest run src/map/DetailPanel.test.ts` | Wave 0 |
| LDG-05 | `look` of a neighbour place and of the bind stone through the real intent; existing targets unchanged | server real-handler | `npx vitest run spacetimedb/src/reducers/look_intent.test.ts spacetimedb/src/helpers/examine.test.ts` | exists, extend |
| LDG-05 | Rail exits panel: terrain icon, band word and colour, region suffix, expand one at a time, notes per state, `Travel`/`Cross` aria-labels via `consoleApi.travel`, timer chip only while running, mobile line and chips | component | `npx vitest run src/rails/HereCard.test.ts src/frame/LocationRow.test.ts` | Wave 0 |
| LDG-05 | Rail rows: eye on every kind and exit and Here title, eye beside `HostileCard`, `NPC` hint, `Talk to`, three-button maximum, bind row, `Bind` calls `bind_location`, `Bound here`, keyword label | component | `npx vitest run src/rails/NearbyList.test.ts src/rails/nearby.test.ts src/console/keywords.test.ts src/combat/EncounterPanel.test.ts` | exists, extend |
| LDG-05 | Party stamina text and red mark below the within-region cost; hidden in combat | component | `npx vitest run src/rails/PartyBlock.test.ts` | exists, extend |
| LDG-04/05 | Mobile: Map tab opens Map sheet with Map and Here tabs, every action reachable, 44px in source, tab bar visible | component + source text | `npx vitest run src/map/MapSheet.test.ts src/frame/AppFrame.screens.test.ts` | Wave 0 / extend |
| LDG-04/05 | Design guards: no new token (23), no literal colour incl. SVG, `<svg` only in `src/map/`, spacing and type scale, Phosphor only, `h4`/`h6` only, no `v-html`, escape test on place, region, quest and description text, banned word | guard | `npx vitest run src/styles src/frame/frameContract.test.ts src/legacyClientRemoval.test.ts spacetimedb/src/data/no_ripple_word.test.ts` | exists, update |

### Sampling Rate
- **Per task commit:** the quick command scoped to the touched folder (for example `npx vitest run src/map/graphLayout.test.ts`).
- **Per wave merge:** `npx vitest run` and `npx vue-tsc -b`.
- **Phase gate:** full suite green except the three baseline failures, then `npx vue-tsc -b`, before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `spacetimedb/src/helpers/visited.test.ts`, `views/visited.test.ts`, `helpers/passages.test.ts`, `reducers/passage_sweep.integration.test.ts`, `data/travel_config.test.ts`, `helpers/travel.test.ts` (or extend `combat_choices` style integration)
- [ ] `src/map/*.test.ts` for every pure helper and component listed above
- [ ] Update `scheduled_guard.integration.test.ts` (`SCHEDULED` list and the forged-chain cases), `designContract.test.ts`, `frameContract.test.ts`, `gameDataAlias.test.ts`, `screens.test.ts`, `AppFrame.screens.test.ts`, `railsShell.test.ts`, `nearby.test.ts`, `keywords.test.ts`
- [ ] Framework install: none (vitest is present)

## Security Domain

`security_enforcement` is not set to false in `.planning/config.json`, so this section applies.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (no new auth surface) | existing SpacetimeAuth login |
| V3 Session Management | no | existing |
| V4 Access Control | yes | Private `visited_location` exposed only through the per-sender `my_visited_locations` view (index lookups from `player.activeCharacterId`); scheduled reducer rejects any caller other than the module identity as its first statement; optional admin reducer uses `requireAdmin`; `move_character` and `bind_location` already use `requireCharacterOwnedBy` |
| V5 Input Validation | yes | No new client-supplied free text reaches the server (Travel and Bind take ids). Client renders all server strings (place, region, terrain, character, NPC, quest, description) as text nodes: no `v-html`, no `innerHTML`; SVG text is never built from strings; node and edge ids are bigint-derived keys |
| V6 Cryptography | no | none |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A client forges a scheduled reducer call to fork a second self-rescheduling sweep chain | Tampering / Denial of Service | Module-identity guard before any db access; `scheduled_guard.integration.test.ts` covers the guard and the no-second-chain case (CR-01 pattern) |
| Another player's visited places leak | Information Disclosure | Table private; view filters by the sender's active character; test that a second player sees nothing of the first |
| XSS through LLM-generated place, region or description text | Tampering | Text nodes only; img-onerror escape test on the Map detail, chips, labels, `title`/`aria-label` attribute values |
| Stored text in SVG attributes or `title` | Tampering | Never interpolate server strings into SVG attributes other than `aria-label`/`title` as plain attribute values via Vue binding (escaped) |
| Passage collapse deletes a row another transaction still points at (data integrity) | Tampering | Single transaction; total re-home helper; test each dependent table |
| Cooldown or stamina tampering | Elevation | The client only predicts; `performTravel` re-checks everything server-side |
| Paid LLM spend triggered by travelling onto an uncharted edge | Denial of Service (cost) | Existing budget gates in `startWorldGeneration`; no automated test calls it |

## Sources

### Primary (HIGH confidence, read or queried this session)
- `C:\projects\uwr\.planning\phases\51-ledger-screens-world-and-people\51-CONTEXT.md`, `51-UI-SPEC.md`, `.planning\REQUIREMENTS.md`, `.planning\ROADMAP.md`, `.planning\STATE.md` (resume note 2026-10-07)
- Design scratchpad extracts `design51/map2/MAP2-EXTRACT.md` (sections A.3, G), `p51/scout.md`
- Server code: `spacetimedb/src/helpers/travel.ts`, `helpers/location.ts`, `helpers/world_gen.ts` (writeRegionStart, boundary creation), `helpers/llm_apply.ts` (passage rename, quest location fields), `helpers/examine.ts`, `helpers/look.ts`, `helpers/character.ts`, `helpers/corpse.ts`, `data/travel_config.ts`, `data/mechanical_vocabulary.ts`, `data/llm_schemas.ts`, `schema/tables.ts`, `views/*.ts`, `index.ts` (scheduled reducers, init, clientConnected), `reducers/movement.ts`, `reducers/characters.ts`, `reducers/intent.ts`, `reducers/auth.ts`, `reducers/scheduled_guard.integration.test.ts`, `reducers/look_intent.test.ts`, `reducers/combat_choices.integration.test.ts`, `helpers/combat_fight_fixture.ts`, `helpers/test-utils.ts`
- Client code: `src/rails/levelRange.ts`, `HereCard.vue`, `NearbyList.vue`, `nearby.ts`, `PartyBlock.vue`, `ContextContent.vue`, `quests.ts`, `worldEvent.ts`; `src/game/context.ts`, `queries.ts`, `serverClock.ts`; `src/ledger/ledgerData.ts`, `actionRunner.ts`, `NoticeLine.vue`; `src/session/useSession.ts`; `src/frame/AppFrame.vue`, `Drawer.vue`, `Sheet.vue`, `LocationRow.vue`, `src/screens/screens.ts`, `MapScreen.vue`; `src/console/useConsole.ts`, `keywordLabel.ts`; `src/styles/designContract.test.ts`, `cssContract.ts`, `colors.guard.test.ts`, `src/frame/frameContract.test.ts`, `src/gameDataAlias.test.ts`, `src/combat/effectChipsGuards.test.ts`
- Local database (read-only `spacetime sql uwr ... --server local`): `location`, `location_connection`, `character`, `region`, `npc`, `travel_cooldown`, `admin_llm_status`
- `package.json`, `spacetimedb/package.json`, `vite.config.ts`, `node_modules/@phosphor-icons/vue/dist/index.d.ts`
- Project `CLAUDE.md` and `MEMORY.md` rules

### Secondary (MEDIUM confidence)
- none beyond the above (no external documentation was needed; no new library is introduced)

### Tertiary (LOW confidence)
- none

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new packages; versions read from `package.json`.
- Architecture: HIGH - every integration point (travel, views, scheduled reducers, hubs, shell slots, guards) was read in the code; the design choices that are recommendations are in the Assumptions Log.
- Pitfalls: HIGH - each comes from code read this session or from local data (stale cooldown rows, passage shapes).

**Research date:** 2026-10-07
**Valid until:** 2026-10-14 (the repo is moving: Phase 50 plan 50-39 is editing `Drawer.vue` and `Sheet.vue` now, and 51.1 will change `context.ts` and `PartyBlock.vue`; re-read those files at plan time)
