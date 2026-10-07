---
phase: 51-ledger-screens-world-and-people
verified: 2026-10-07T12:47:28Z
status: human_needed
score: 13/14 must-haves verified (5 roadmap success criteria + 9 owner decisions; 1 present but behavior-unverified, routed to human)
behavior_unverified: 1
overrides_applied: 1
overrides:
  - must_have: "51-08: A Graph | List switch (SegTabs, tablist 'Map view') sits at the canvas top-right; the List panel lists every drawn node in layout order (and 51-12 MS-05 'the List view stays')"
    reason: "Owner play-test 2026-10-07 (51-CONTEXT.md 'Owner play-test: no List view'): 'I think we should remove list view from the map ... Why do we have list?'. Removed in 51-13 (0cde3100). The List was a UI-SPEC keyboard and screen-reader equivalent, not in the mock and not in any ROADMAP success criterion. The graph keeps roving-tabindex keyboard reach and a full spoken aria-label per place, pinned by GraphPlane.test.ts, MapScreen.test.ts and MapSheet.test.ts."
    accepted_by: "owner (recorded in 51-CONTEXT.md)"
    accepted_at: "2026-10-07T00:00:00Z"
behavior_unverified_items:
  - truth: "At 390x844 the Map opens as a full-height sheet from the Map tab, and every action above works (ROADMAP SC5)"
    test: "Run the local stack at 390x844. Tap the Map tab. On the Map tab: open Regions and pick a region, open Legend, pick a near place and Travel, pick a border neighbour and Cross (with and without the region timer running), pick a far place and Select first stop, open Details. On the Here tab: expand an exit and Travel, use Examine on each row, Talk to an NPC, Bind at a bind stone, Whisper and Invite a player. Check the exit chip strip under the Story location line."
    expected: "The Map is a full-height sheet above the visible tab bar with Map and Here tabs; every action sends once and the rows update from the subscription; the canvas keeps at least 240px and the dock button stays visible; every control is at least 44px (48px dock button)."
    why_human: "happy-dom component and frame tests prove the wiring, sizes in CSS and focus rules, but not the real viewport, sheet height, touch targets or live reducer round-trips. The owner deferred this live run to the end-of-milestone UAT."
human_verification:
  - test: "Desktop Map at 1280x800 (owner-deferred, end-of-milestone UAT): open the Map on Sennet Basin, Tessarine Shelf, Kesterlane Basin and Orrowmere Teeth; pick places; travel; cross a border"
    expected: "Places spread out in two dimensions with breathing room (Sennet Basin bends, not a straight line); the To Kesterlane Basin pill sits clear of Cormorant Stair; other regions sit outside the outline on the facing side; the first open shifts once to fill the canvas after it is measured; legend, region chips, Region travel pill and the detail column (button docked) read well; at 900 the legend wraps to at most three lines and the canvas keeps 320px."
    why_human: "Visual layout quality on a real canvas (51-12 MS-08, 51-08/51-09 backstops)."
  - test: "Mobile Map sheet at 390x844 and every action (see behavior_unverified_items, ROADMAP SC5)"
    expected: "As in behavior_unverified_items."
    why_human: "Real viewport and live round-trips; owner-deferred."
  - test: "Rail travel panel and Nearby live at 1280: expand an exit row, Travel and Cross from the panel; start the region timer and watch the timer chip, the locks on crossing rows and region chips, and the Ready announcement when it ends; Examine eyes on every row and beside each enemy card in combat; Talk on an NPC; Bind at a bind stone (and the refusal in combat); lead a party with a following member and check '{n} following', that the member comes along, and the party stamina low mark in the left vitals rail"
    expected: "Row click only expands; Travel/Cross travel once; timers show the server's remaining time only; Bind turns the row to 'Bound here'; the follower arrives with the leader."
    why_human: "Live multi-character party play and timer behaviour over real minutes."
  - test: "Live passage collapse (needs a paid LLM call and the owner's go-ahead): explore 'The Edge Beyond Sennet Basin' (id 4112), stay in the generated passage, then leave; repeat with an offline character left in a passage"
    expected: "The passage stays while anyone stands in it; when the last character leaves it collapses and the Map draws a direct border crossing (gate pill); an offline character left in it is moved back to its own side within one 5-minute sweep and the passage then collapses."
    why_human: "Generation of a new region is a paid LLM call; real-handler tests cover the rule, the live world has no passage to exercise today."
  - test: "Owner copy and rule choices from 51-11-SUMMARY: 'about 1 minute' singular; '1 stop' vs '{n} stops'; uncharted note follower part ('Travelling here opens a new region. {n} following.' / 'Only you travel.'); several blocked followers joined with ', ' and ' and '; one quest card per quest with roles joined ' · '; mobile location line without Day/Night; dock fail-line colour (BAD when any check is bad, else WAIT); arrival banner on the mobile Map tab; research assumptions A1 (sweep returns to fromLocationId when own-side, else lowest-id own-side neighbour), A3 (5-minute sweep, offline = no player row with that active character), A4 (Players count includes offline characters until 51.1), A9 (plain server look copy for neighbouring places and the bind stone)"
    expected: "Owner approves or names changes."
    why_human: "Owner copy and design decisions."
  - test: "Owner choices from 51-12-SUMMARY and 51-13: minimum place gap 160px desktop / 112px mobile (MIN_NODE_GAP, one constant if 180px is wanted); the map shifts once after the canvas is measured (owner already confirmed); no region caption on the mobile sheet (MS-07); the Map is graph-only after the List removal, so keyboard and screen-reader use rely on the graph's roving tabindex and spoken labels"
    expected: "Owner approves or names changes."
    why_human: "Owner design decisions and assistive-technology feel."
---

# Phase 51: Ledger Screens: Map and Travel Verification Report

**Phase Goal:** Players see and travel the world through the Map drawer (desktop) and sheet (mobile) and the redesigned travel panel in the context rail. The rail gains Examine, Talk and bind stone actions.
**Verified:** 2026-10-07T12:47:28Z
**Status:** human_needed
**Re-verification:** No (initial verification)

Everything that can be checked in the code, the tests and the live local database holds. I found no blocking gap. The open items are the owner-deferred live checks (visual layout at 1280x800 and 390x844, a live passage collapse that needs a paid LLM call) and the owner's copy choices.

**Note on the code under test.** Plan 51-13 (removing the Map List view, on the owner's request) landed while this verification was running (`0cde3100`, `7d8213c8`). I verified both states:
- `933f7b48` (end of 51-12) in a separate detached worktree: every `src` and `spacetimedb/src` test file and `vue-tsc`.
- The current HEAD `7d8213c8` in the main tree: `src/map`, `src/frame`, `src/styles`, `src/rails`, `src/screens` and `vue-tsc`.

The 51-08 List-view must-have is recorded as an owner override (see the frontmatter).

## Goal Achievement

### Observable Truths: ROADMAP success criteria

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Map shows known places (visited plus heard-of neighbours) as a route graph with region borders, border crossings and a legend, plus the known regions with level ranges; a region shows a lock with the time left only while the caller's cross-region timer runs (LDG-04) | ✓ VERIFIED | **Server:** private `visited_location` (`schema/tables.ts:2331`), with no `public` flag. Per-sender view `my_visited_locations` (`views/visited.ts`), index lookups only. Written on every arrival (`helpers/travel.ts:171-172`, `world_gen.ts:349`, `llm_apply.ts:544`, `character.ts:278`, `corpse.ts:170`, `reducers/characters.ts:77,323`, `passages.ts:332`).<br>**Client:** `knownPlaces` (`src/map/knownPlaces.ts:29`) builds visited and heard-of places. `GraphPlane.vue:231-241` draws the svg border, edges and route. Gate pills mark crossings. `MapLegend.vue` shows Places, the terrains (Swamp at `terrain.ts:32`), 'Danger vs Lv {n}:' and 'Region entrance'. `MapMeta.vue` region chips show 'Lv a–b'.<br>**Lock:** `MapMeta.vue:34-35` `locked = timer.running && !chip.isYours`. `travelTimer.ts` is `readyAtMicros` minus the server clock, with no reduction math and no fixed duration. No level lock anywhere. |
| 2 | Picking a place shows description, danger, travel cost, services, players there and related quests; neighbours get one Travel button (or Cross into {Region}); members with Follow leader on come along; far places show their path and no Travel button (LDG-05) | ✓ VERIFIED | **Detail:** `DetailPanel.vue:141-183` (description, Stamina, Services, Players, quests, 'Can you go?').<br>**Button:** `detailModel.ts:193` is the one button, 'Cross into {Region}' or 'Travel to {place}'. Far places get 'Select first stop' and FAR_NOTE (`:153`, `:244-257`) and no Travel button.<br>**Travel:** `useDestination.ts:144` calls `moveCharacter({ characterId, locationId })`.<br>**Followers:** the server moves following members at the leader's place (`helpers/travel.ts:84-97`). `followLeader` defaults to true on join (`reducers/groups.ts:41,64,296,370`); the switch UI is Phase 51.1. The note shows '{n} following' or 'only you travel' (`detailModel.ts:181-185`).<br>**Stamina:** one shared rule, `travelStaminaCost` (`data/travel_config.ts`), used by `performTravel` (`travel.ts:109,143`) and by the client through `@game-data/travel_config`. |
| 3 | The rail travel panel lists routes out with terrain, danger and region crossings, and travels from the panel; every rail row has an Examine eye; NPC rows have a Talk chat bubble instead of "hail"; a bind stone row offers Bind | ✓ VERIFIED | **Here card:** `src/rails/HereCard.vue` builds rows from `exitRows` (built from `travelChecks`, `placeDanger` and `terrainOf`). Rows expand with `aria-expanded` (`:119`). The inner button calls `consoleApi.travel` (`:40`). The title eye calls `consoleApi.look()` (`:45`) and the row eyes call `consoleApi.examine` (`:50`). It is mounted in `ContextContent.vue:12`.<br>**Nearby:** `NearbyList.vue` has a PhEye on enemy, NPC, bind stone, object, node and player rows (`:267`, `:362`). Talk uses PhChatCircleDots, 'Talk to {name}' (`:304-309`). The bind stone row (PhCastleTurret) calls `reducers.bindLocation({ characterId })` (`:225`), and the eye sends `look at bind stone` (`:132-133`).<br>**Elsewhere:** the keyword label is `npc: 'Talk to'` (`console/keywordLabel.ts:6`). The enemy-card eye sits beside the card (`combat/EncounterPanel.vue:62-85`). The server looks at neighbouring places and the bind stone (`helpers/examine.ts:189-219`). |
| 4 | Explored passages collapse into direct border crossings once nobody stands in them; offline characters left in a passage are swept back to their own side | ✓ VERIFIED (behavioral) | **Collapse:** `collapsePassageIfEmpty` (`helpers/passages.ts:249`) runs after the whole party moves (`travel.ts:270`). `collapsePassageAfterLeaving` covers respawn, auto-respawn, resurrection and delete (`character.ts:280`, `corpse.ts:172`, `reducers/characters.ts:288,325`).<br>**Sweep:** `sweepPassages` (`:311`) skips online characters, characters in a fight, passages with an active encounter, and passages without an own side and a far side. It never moves anyone across the border.<br>**Scheduling:** `sweep_passages` has the module-identity guard as its first statement and re-arms every 300 s (`index.ts:423-430`). It is armed in init and on connect (`:687`, `:713`).<br>**Tests:** real-handler tests pass: `passage_sweep.integration.test.ts` (20 cases) and `travel_passage.integration.test.ts` (collapse on travel, followers, respawn, delete, auto-respawn).<br>**Live DB:** no `terrain_type = 'passage'` rows are left, so the one-time cleanup ran. `passage_sweep_tick` fired and re-armed during this run (scheduled_id 70, then 71, 5 minutes apart). |
| 5 | At 390x844 the Map opens as a full-height sheet from the Map tab, and every action above works | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | **Wiring present:**<br>- `frame/tabs.ts:10,21-22`: the Map tab opens 'map'.<br>- `MapScreen.vue` mobile branch: SegTabs 'Map sheet view' (Map, Here). The Map tab is `MapSheet` (region row, `RegionsListbox`, Legend disclosure, canvas, `MapDock` sharing `useDestination`). The Here tab is `ContextContent` (Here card, Nearby).<br>- `ExitChips.vue` sits under the mobile location line.<br>**Tests:** `mobileTargets.test.ts` pins 44px targets (48px dock button). `AppFrame.screens.test.ts:453-502` covers the sheet, the tab bar still rendered and Travel from the Here tab.<br>**Not proven:** the real viewport and live round-trips. These are owner-deferred to the milestone UAT. |

### Observable Truths: owner decisions (51-CONTEXT.md)

| # | Decision | Status | Evidence |
|---|----------|--------|----------|
| 6 | Known places recorded on the server: private table plus `my_*` view; heard of derived on the client | ✓ VERIFIED | **Server:** `visited_location` is private. `my_visited_locations` reads player by sender, then `by_character`. Only `helpers/visited.ts` inserts rows (pinned by a source test); duplicates are cleaned (review IN-03).<br>**Client:** subscribes only to the view (`src/map/queries.ts`), never the private table.<br>**Live DB:** `SELECT COUNT(*) FROM visited_location` returns 4. |
| 7 | Travel cost shown from the server rules; nothing copied on the client | ✓ VERIFIED | `data/travel_config.ts` imports nothing. `travelChecks.ts`, `rails/party.ts:4,63` and the server all call the same `travelStaminaCost` and `travelEffectDiscount`. `CROSS_REGION_COOLDOWN_MICROS` is server-only. |
| 8 | Regions lock only by the travel timer (no level gate); the client shows only the server's remaining time | ✓ VERIFIED | **Timer:** `travelTimer.ts`. The hub ticks only while a party or own row is in the future (`secondsTick.ts`).<br>**Display:** chips, the Region travel pill (`TravelPill.vue`), gates and exit rows show `{m:ss}` from that timer. Border pill levels are a warning only. |
| 9 | SVG allowed in `src/map/` only, token colours, one coordinate plane | ✓ VERIFIED | **svg:** the only `.vue` with `<svg` is `src/map/GraphPlane.vue`.<br>**Guards:** `designContract.test.ts:254-293` (svg folder allowance, shape elements only) and the svg colour guard (`cssContract.ts` `templateColorOffenders`, review WR-05) pass.<br>**Plane:** edge endpoints equal node centres (graphLayout tests). |
| 10 | Owner play-test map spacing (51-12, MS-01 to MS-07): a 2D deterministic layout fills the measured canvas, 160/112px gaps, pills 16px clear, other regions outside the outline on the facing side, reading order, spatial arrows, one shared graph | ✓ VERIFIED (automated) | **Layout:** `graphLayout.ts` sets `MIN_NODE_GAP 160` and `COMPACT_MIN_NODE_GAP 112` (`:37-38`). It imports only `./order`, with no randomness or time.<br>**Tests:** `graphLayout.test.ts` passes 148 cases (Sennet Basin bend, Kesterlane gate clearance, fill at 652x600, determinism, under 20ms for 30 places).<br>**Canvas:** `GraphPlane.vue:187-205` measures with a ResizeObserver. `mapData` keys `known` on `currentLocationId`.<br>**Pending:** the visual check is deferred (human item 1). |
| 11 | Party stamina in the left vitals rail with a low mark | ✓ VERIFIED | `PartyBlock.vue:56-62` adds ', too low to travel'. `rails/party.ts:63` uses the shared within-region cost. |
| 12 | Passage edge cases: binds, quests and events at a passage are re-pointed or cleared; the re-home list stays complete | ✓ VERIFIED | **Code:** `PASSAGE_LOCATION_COLUMNS` covers 26 columns and is guarded by a schema-coverage test. `rehomePassageDependents` handles them, and event spawns move with their objectives (review IN-07). `fromLocationId` is re-pointed (IN-04).<br>**Tests:** `passages.test.ts` passes. |
| 13 | No List view (owner, 2026-10-07, plan 51-13) | ✓ VERIFIED | At HEAD, `GraphList.vue` is deleted and `src` has no `GraphList`, `listRows`, `setView` or `MapView` (except a negative source assertion in `MapScreen.test.ts:341`). `GraphPlane.test.ts` walks the keyboard to every drawn place with its full aria-label. The mobile Map / Here tabs remain. |
| 14 | LDG-05 wording: one Travel button, followers come along | ✓ VERIFIED | `.planning/REQUIREMENTS.md:73` now reads "with one Travel button (Cross into {Region} at a border); party members with Follow leader on come along when the leader travels." |

**Score:** 13/14 verified, 1 present but behavior-unverified (SC5, the live mobile viewport). One plan must-have (the 51-08 List view) passed by owner override.

### Plan must-haves (51-01 to 51-13)

| Plan | Must-have focus | Status | Evidence |
|------|-----------------|--------|----------|
| 51-01 | Shared stamina rule; private visited table and view; look at neighbours and the bind stone | ✓ | `travel_config.test.ts`, `visited*.test.ts`, `views/visited.test.ts`, `examine.test.ts`, `look_intent.test.ts`, `travel_visited.integration.test.ts` pass |
| 51-02 | svg guard with one folder; wide tier in src/map; danger, terrain, timer, known places, route, chips helpers | ✓ | `designContract.test.ts`, `frameContract.test.ts`, `danger/terrain/travelTimer/knownPlaces/route/regionChips` tests pass |
| 51-03 | Collapse on departure, guarded sweep, live publish (key 108), bindings with `myVisitedLocations` | ✓ | Passage tests pass; `scheduled_guard.integration.test.ts` includes `sweep_passages`. **Live:** `admin_llm_status` reads `key_set true, key_length 108`, there are no passage rows and the tick is running. `src/module_bindings/index.ts:1801` has `myVisitedLocations` |
| 51-04 | Deterministic layout, node, route and gate views | ✓ (layout superseded by 51-12) | `graphLayout.test.ts`, `nodeView.test.ts` pass |
| 51-05 | travelChecks and detail model, one Travel button | ✓ | `travelChecks.test.ts`, `detailModel.test.ts` pass |
| 51-06 | Rail Examine eye, Talk, bind stone row, enemy-card eye, party stamina | ✓ | `src/rails` tests (766 incl. frame, styles, screens) pass at HEAD |
| 51-07 | Map hub, subscriptions equal to their SQL, tick only while running, provided in App.vue | ✓ | `App.vue:7,27` provide `MAP_KEY`; `useSession.ts:47,175`; `mapData.test.ts`, `queries.test.ts`, `secondsTick.test.ts` pass |
| 51-08 | Map drawer: svg plane, keyboard, legend, screen args, registry | ✓, List view by override | `screens.ts:48-55` registers MapScreen, MapMeta and MapActions. `AppFrame.vue:84` keeps the args for 'map'. The List view was removed by owner decision (51-13) |
| 51-09 | Destination detail, Travel via `move_character`, arrival banner, region chips, Region travel pill | ✓ | `DetailPanel`, `useDestination`, `arrival`, `MapMeta`, `TravelPill` tests pass |
| 51-10 | Here card exits, mobile location line, exit chips | ✓ | `HereCard`, `exits`, `ExitChips`, `LocationRow` tests pass; `sharedTravelGuard.test.ts` passes |
| 51-11 | Mobile sheet, dock, listbox, 44px targets, LDG-05 wording, phase gate | ✓ | `MapSheet`, `MapDock`, `RegionsListbox`, `mobileTargets` tests pass |
| 51-12 | 2D layout filling the canvas, clearances, reading order, one shared graph | ✓ | See truth 10 |
| 51-13 | List view removal (owner request; summary only, no PLAN file) | ✓ | See truth 13 |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `spacetimedb/src/data/travel_config.ts` | Shared stamina rule, imports nothing | ✓ VERIFIED | Used by the server and the client |
| `spacetimedb/src/helpers/visited.ts`, `views/visited.ts` | Visited upsert and per-sender view | ✓ VERIFIED | Wired in 8 arrival paths |
| `spacetimedb/src/helpers/passages.ts` (338 lines) | Sides, re-home, collapse, sweep | ✓ VERIFIED | Wired in travel, respawn, resurrect, delete and the sweep |
| `spacetimedb/src/helpers/online.ts` | `onlineCharacterIds` | ✓ VERIFIED | `disconnect_logout` (`reducers/auth.ts:57-95`) clears `activeCharacterId` 30 s after a disconnect, so offline detection works |
| `src/map/*` (graphLayout, nodeView, GraphPlane, MapScreen, MapSheet, MapDock, DetailPanel, MapMeta, TravelPill, MapLegend, RegionsListbox, useDestination, useMapGraph, mapData, queries) | Map screen and sheet | ✓ VERIFIED | All substantive and wired through `screens.ts` and `MAP_KEY` |
| `src/rails/HereCard.vue`, `exits.ts`, `ExitChips.vue`, `NearbyList.vue`, `nearby.ts`, `PartyBlock.vue`, `src/frame/LocationRow.vue` | Rail travel panel and row actions | ✓ VERIFIED | Mounted in `ContextContent` and `AppFrame` |

### Key Link Verification (CLAUDE.md: the client calls every reducer)

| From | To | Via | Status |
|------|----|-----|--------|
| Map Travel / Cross (desktop detail and mobile dock) | `move_character` | `useDestination.ts:144` `reducers.moveCharacter({ characterId, locationId })`, through the shared runner and the trip guard | WIRED |
| Rail Here card and mobile exit chips | `move_character` | `consoleApi.travel` → `useConsole.ts:383-390` `moveCharacter` | WIRED |
| Nearby Bind | `bind_location` | `NearbyList.vue:225` `reducers.bindLocation({ characterId })` | WIRED |
| Examine eyes / Talk | `look at {name}` / hail intents | `consoleApi.examine` (`useConsole.ts:393`), `consoleApi.look` (`:404`), `consoleApi.hail` | WIRED |
| Map hub | `my_visited_locations`, `location_connection`, `travel_cooldown`, `npc`, `character` | `src/map/queries.ts` typed SQL; `useSession.ts:175` | WIRED |
| `performTravel` | `collapsePassageIfEmpty`, `markLocationVisited`, `travelStaminaCost` | `travel.ts:109,143,171-172,270` | WIRED |
| `sweep_passages` tick | `sweepPassages` | `index.ts:423-430`; table `passage_sweep_tick` (`tables.ts:2349`) | WIRED (live tick observed) |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| MapScreen and MapSheet graph | `known` places and edges | `my_visited_locations` view, `location_connection` table, the session's locations | Yes (4 live visited rows) | ✓ FLOWING |
| Region timer (chips, pill, gates, exits) | `selfTimer` | `travel_cooldown` rows of you and your party, and the server clock | Yes | ✓ FLOWING |
| Detail Services / Players | `npcsAtSelected`, `charactersAtSelected` | Keyed subscriptions on the selected place; null until applied (review WR-02) | Yes | ✓ FLOWING |
| Party stamina | Member character rows | The game hub's party subscription | Yes | ✓ FLOWING |

### Behavioral Spot-Checks and Gates

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite (dirty tree mid-51-13, run once) | `npx vitest run` | 9966 of 9970 pass. Failures: the 3 baseline files, plus `mobileTargets.test.ts` and `GraphList.test.ts`, which came from the uncommitted 51-13 edits in progress at that moment; both pass after `0cde3100` | Informational |
| End of 51-12, isolated worktree (`933f7b48`) | `npx vitest run src` (covers `src` and `spacetimedb/src`) | 318 of 319 files, 9431 tests pass; only failure is the baseline `measurement.results.test.ts` | ✓ PASS |
| Phase 51 server tests (`933f7b48`) | 12 named files (passage sweep and travel, visited, examine, look, bind_location, scheduled guard, travel_config) | 255 of 255 | ✓ PASS |
| Current HEAD map client | `npx vitest run src/map` | 31 files, 717 tests | ✓ PASS |
| Current HEAD frame, styles, rails, screens | `npx vitest run src/frame src/styles src/rails src/screens` | 42 files, 766 tests | ✓ PASS |
| Layout (`933f7b48`) | `npx vitest run src/map/graphLayout.test.ts` | 148 of 148 | ✓ PASS |
| Types | `npx vue-tsc -b` at `933f7b48` and at `0cde3100` | exit 0 both | ✓ PASS |
| Live key | `spacetime sql uwr "SELECT * FROM admin_llm_status" --server local` | `true, 108, true` | ✓ PASS |
| Live passages | `SELECT * FROM location WHERE terrain_type = 'passage'` | 0 rows; one uncharted edge remains (`The Edge Beyond Sennet Basin`, 4112) | ✓ PASS |
| Live sweep | `SELECT * FROM passage_sweep_tick` (twice) | id 70 due 12:25:50, then id 71 due 12:30:50 | ✓ PASS |

The scripts baseline files (`scripts/llm/call_log_report.test.mjs`, `scripts/llm/proof_rules.test.mjs`) fail to load, as before. Every verification query was a read-only SELECT. Nothing was published, cleared or written.

### Probe Execution

None declared. Step 7c: SKIPPED (no `scripts/*/tests/probe-*.sh` declared or implied by this phase).

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| LDG-04 | 51-01, 02, 03, 04, 07, 08, 09, 11, 12 | Known places as a route graph with a legend (here, visited, heard of, bind point) and a region list with level ranges | ✓ SATISFIED | SC1 and truths 6, 9, 10. The visual check is deferred |
| LDG-05 | 51-01, 05, 06, 07, 09, 10, 11 | Picking a node shows description, danger, travel cost, services, players and related quests, with one Travel button (Cross into {Region}); followers come along | ✓ SATISFIED | SC2, truths 7, 14 |

No orphaned requirements. REQUIREMENTS.md maps only LDG-04 and LDG-05 to Phase 51, and both are claimed. Their checkboxes and traceability rows still read Pending; the orchestrator updates them at phase completion.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (phase files in `src/map`, `src/rails`, server helpers) | — | TBD / FIXME / XXX / TODO / HACK | none found | — |
| `src/map`, `src/rails` | — | `v-html`, the banned word | none (only negative test assertions) | — |
| `spacetimedb/src/helpers/passages.ts` | 316-319 | Whole `location` table read per 5-minute sweep tick | ℹ️ Info | Accepted and documented (review IN-01/IN-02); an index needs a migration trial |
| `src/console/useConsole.ts` | 386, 397 | The rail's Travel and Examine close the active screen, so on the mobile Map sheet's Here tab they close the sheet | ℹ️ Info | By design (51-10; pinned by `AppFrame.screens.test.ts:466`). The Map tab's dock keeps the sheet open. Worth a look in the mobile UAT |
| Detail Players count | — | Includes offline characters until 51.1 adds online status | ℹ️ Info | Decided (coordinator decision 3, A4) |
| `.planning/phases/51-.../51-13-*` | — | 51-13 has a SUMMARY but no PLAN file; ROADMAP still says "Plans: 12 plans" | ℹ️ Info | Owner-requested direct change. The orchestrator can add the 51-13 line to ROADMAP |
| `51-VALIDATION.md` | 6 | `status: draft` with `nyquist_compliant: true` | ℹ️ Info | Left for /gsd-validate-phase, as 51-11 noted |

### Human Verification Required

All of these are owner-deferred to the single end-of-milestone UAT. None blocks the phase.

### 1. Desktop Map at 1280x800

**Test:** Open the Map on Sennet Basin, Tessarine Shelf, Kesterlane Basin and Orrowmere Teeth. Pick places, travel, and cross a border. Repeat at 900.
**Expected:**
- Places spread out in two dimensions, and Sennet Basin bends.
- The Kesterlane pill sits clear of Cormorant Stair.
- Other regions sit outside the outline.
- The map shifts once after the canvas is measured.
- The legend, chips, pill and detail column read well, and the button stays docked.
**Why human:** Visual layout quality on a real canvas.

### 2. Mobile Map sheet at 390x844 and every action (SC5)

**Test:** See `behavior_unverified_items`.
**Expected:**
- A full-height sheet above the tab bar, with Map and Here tabs.
- Every action works.
- 44px targets, and the canvas keeps at least 240px.
**Why human:** A real viewport and live round-trips.

### 3. Rail travel panel, Nearby actions and party travel, live

**Test:** In the rail:
- Expand an exit row and Travel or Cross.
- Run the region timer and watch the chip, the locks and the Ready announcement.
- Use the Examine eyes, Talk and Bind (also try Bind in combat).
- Lead a party with a following member.

**Expected:**
- The follower comes along, and the note shows '{n} following'.
- Timers show only the server's remaining time.
- The bind row turns to 'Bound here'.
- The low-stamina mark shows in the vitals rail.
**Why human:** Live multi-character play over real minutes.

### 4. Live passage collapse (paid LLM call, owner go-ahead)

**Test:**
- Explore 'The Edge Beyond Sennet Basin', stay in the generated passage, then leave.
- Repeat with an offline character left in a passage.

**Expected:**
- The passage stays while someone stands in it.
- It collapses into a gate pill when the last character leaves.
- An offline occupant is swept back to its own side within 5 minutes.
**Why human:** Needs a new region from a paid LLM call; the live world has no passage today.

### 5. Owner copy and rule choices (51-11-SUMMARY)

**Test:** Review each choice:
- 'about 1 minute' singular, and '1 stop' vs '{n} stops'.
- The uncharted note's follower part, and how several blocked followers are joined.
- One quest card per quest.
- The mobile location line without Day/Night.
- The dock fail-line colour, and the arrival banner on the mobile Map tab.
- Research assumptions A1, A3, A4 and A9.

**Expected:** The owner approves each or names changes.
**Why human:** Owner decisions.

### 6. Owner choices from 51-12 and 51-13

**Test:** Review each choice:
- MIN_NODE_GAP 160 (raise to 180?).
- No caption on mobile.
- The graph-only Map for keyboard and screen-reader users after the List removal.

**Expected:** The owner approves each or names changes.
**Why human:** Owner design decisions and how the graph feels with assistive technology.

### Gaps Summary

No gaps. All five roadmap success criteria and the owner decisions are backed by substantive, wired code and passing tests, at the end of 51-12 and at the current HEAD after 51-13. The live local database matches the server design:
- no passages remain;
- the guarded sweep tick fires and re-arms every 5 minutes;
- visited rows exist;
- the LLM key is intact (108).

The phase is `human_needed` only because the owner deferred the live viewport checks (SC5, the 51-12 visual spacing), a live passage collapse that needs a paid LLM call, and the copy choices to the end-of-milestone UAT.

---

_Verified: 2026-10-07T12:47:28Z_
_Verifier: Claude (gsd-verifier)_
