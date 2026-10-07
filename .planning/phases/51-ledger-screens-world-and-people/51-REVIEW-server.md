---
phase: 51-ledger-screens-world-and-people
reviewed: 2026-10-07T10:10:03Z
depth: deep
scope: "git diff 3ecb1520..HEAD -- spacetimedb/src (server part; HEAD 948e2ece)"
files_reviewed: 40
files_reviewed_list:
  - spacetimedb/src/data/action_result.ts
  - spacetimedb/src/data/crafting_rules.test.ts
  - spacetimedb/src/data/crafting_rules.ts
  - spacetimedb/src/data/inventory_rules.test.ts
  - spacetimedb/src/data/inventory_rules.ts
  - spacetimedb/src/data/travel_config.test.ts
  - spacetimedb/src/data/travel_config.ts
  - spacetimedb/src/helpers/action_result.ts
  - spacetimedb/src/helpers/character.ts
  - spacetimedb/src/helpers/corpse.ts
  - spacetimedb/src/helpers/examine.test.ts
  - spacetimedb/src/helpers/examine.ts
  - spacetimedb/src/helpers/llm_apply.characterization.test.ts
  - spacetimedb/src/helpers/llm_apply.ts
  - spacetimedb/src/helpers/online.ts
  - spacetimedb/src/helpers/passages.test.ts
  - spacetimedb/src/helpers/passages.ts
  - spacetimedb/src/helpers/travel.ts
  - spacetimedb/src/helpers/visited.test.ts
  - spacetimedb/src/helpers/visited.ts
  - spacetimedb/src/helpers/visited_arrivals.test.ts
  - spacetimedb/src/helpers/world_gen.ts
  - spacetimedb/src/index.ts
  - spacetimedb/src/reducers/characters.ts
  - spacetimedb/src/reducers/craft_count.test.ts
  - spacetimedb/src/reducers/items_crafting.ts
  - spacetimedb/src/reducers/look_intent.test.ts
  - spacetimedb/src/reducers/passage_sweep.integration.test.ts
  - spacetimedb/src/reducers/recipe_discovery.test.ts
  - spacetimedb/src/reducers/salvage_result.test.ts
  - spacetimedb/src/reducers/scheduled_guard.integration.test.ts
  - spacetimedb/src/reducers/travel_passage.integration.test.ts
  - spacetimedb/src/reducers/travel_visited.integration.test.ts
  - spacetimedb/src/schema/tables.ts
  - spacetimedb/src/views/action_result.test.ts
  - spacetimedb/src/views/index.ts
  - spacetimedb/src/views/llm.test.ts
  - spacetimedb/src/views/types.ts
  - spacetimedb/src/views/visited.test.ts
  - spacetimedb/src/views/visited.ts
findings:
  critical: 1
  warning: 3
  info: 9
  total: 13
status: issues_found
---

# Phase 51: Code Review Report (server)

**Reviewed:** 2026-10-07T10:10:03Z
**Depth:** deep
**Files Reviewed:** 40
**Status:** issues_found

## Summary

Scope was the Phase 51 server diff (`3ecb1520..HEAD -- spacetimedb/src`). It covers the shared travel stamina rule, the private `visited_location` table with the `my_visited_locations` view, the arrival writes and the `set_active_character` backfill, `look at` for neighbouring places and the bind stone, passage collapse (`helpers/passages.ts`), the guarded `sweep_passages` tick, and `online.ts`. The diff also contains the Phase 50 review fixes (craft capacity gate, salvage roll indexes, the `writeActionResult` error type).

I traced call chains into `performTravel`, the combat end and reward paths (`resetSpawnAfterCombat`, end-combat spawn release), `finish_gather`, `disconnect_logout`, `sweep_inactivity`, `set_active_character`, `applyWorldStartResult`/`writeRegionStart`, and the world fill boundary insert.

These parts are sound:
- **View isolation.** `my_visited_locations` reaches the table only through `player.id.find(ctx.sender)` and then `by_character`. It never scans a table, and the private table is not readable directly.
- **Sweep guard.** The module-identity check is the first statement, the reducer re-arms exactly one tick before doing any work, and arming in init and clientConnected is idempotent. The forged-call test is in `scheduled_guard.integration.test.ts`.
- **Travel cost parity.** `travelStaminaCost` is algebraically identical to the removed inline formula, and both performTravel loops call it.
- **Schema additivity.** Only new tables and a new view were added; no column was changed.
- **Determinism.** Every random value comes from ctx data or a seed, and iteration is in id order.
- **Error style.** No new `SenderError` was introduced. Travel refusals still go through `appendSystemMessage`.
- **Coverage list.** `PASSAGE_LOCATION_COLUMNS` covers all 26 location-id columns.

The main defect is in the sweep. It treats "offline" as "safe to relocate" without checking combat. Combat continues after disconnect, but `disconnect_logout` clears `activeCharacterId`, so the sweep can pull a character out of a live fight. The collapse that follows then re-homes the active encounter and deletes its locked enemy spawn. Secondary issues: the collapse can strand a one-way neighbour, only travel departures trigger an immediate collapse, and several smaller robustness and test gaps.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: The sweep moves offline characters out of an active combat, and the collapse then re-homes the live encounter and deletes its enemy spawn

**File:** `spacetimedb/src/helpers/passages.ts:254-263`, also `spacetimedb/src/helpers/passages.ts:158-160` and `:169-174`
**Issue:** `sweepPassages` moves every occupant that is not in `onlineCharacterIds` and checks nothing else. "Offline" is not the same as "idle":
- `disconnect_logout` (`reducers/auth.ts:57-98`) clears `player.activeCharacterId` 30 s after a disconnect. It does not end combat or check it.
- The combat loop has no online check (`reducers/combat.ts` never reads `player`/`activeCharacterId` for participants). `sweep_inactivity` deliberately skips characters in combat (`index.ts:331`), which shows that combat is expected to outlive a disconnect.

Failure scenario: a solo player pulls an enemy in a passage and their connection drops. 30 s later the character counts as offline. The next sweep tick runs `ctx.db.character.id.update({ ...occupant, locationId: target.id })` while the `combat_participant` row is still `active`. This breaks the invariant `performTravel` enforces ("Cannot travel while in combat", `travel.ts:56`). The passage is now empty, so `collapsePassageIfEmpty` runs in the same transaction:
1. It re-homes the still-active `combat_encounter` to `own[0]`. When the character went back to its `fromLocationId` and that place is not the lowest-id own neighbour, the character and its fight are now at different places.
2. It deletes the `enemy_spawn` locked to that combat, plus its `enemy_spawn_member` rows and the `pull_state`.

When the fight ends, `resetSpawnAfterCombat` and the end-combat release silently find no spawn, and no `enemy_respawn_tick` is ever queued. The fight's loot and corpse paths read `combat.locationId`, which is now a place the character never fought in.

No test covers an offline occupant in combat; `passage_sweep.integration.test.ts` seeds no `combat_participant`.

**Fix:** Skip occupants that are in combat, and never collapse a passage that still has a live encounter:
```ts
// passages.ts
import { activeCombatIdForCharacter } from './events';

for (const occupant of occupants) {
  if (online.has(occupant.id)) continue;
  if (activeCombatIdForCharacter(ctx, occupant.id)) continue; // a fight pins the character in place
  ...
}

// collapsePassageIfEmpty, before rehoming:
if ([...ctx.db.combat_encounter.by_location.filter(passageId)].some((c: any) => c.state === 'active')) return false;
```
Add real-handler tests:
- An offline occupant with an active `combat_participant` is not moved, and the passage stays.
- A passage with an active encounter does not collapse.

## Warnings

### WR-01: The collapse deletes inbound-only connections but never relinks their source, so a place can be stranded

**File:** `spacetimedb/src/helpers/passages.ts:95-109` and `:212-221`
**Issue:** `passageSides` collects neighbours only through `location_connection.by_from.filter(passage.id)`, which follows outbound rows. The deletion step removes both `by_from` and `by_to` rows. A place X that has only `X -> passage` (no `passage -> X`) is therefore not classified as own or far, and its row is deleted. X gets no replacement link to either side. If that row was X's only exit, X becomes a dead end, and the sweep can even move characters there indirectly through `fromLocationId`.

`connectLocations` always writes both directions, but nothing in the schema enforces symmetry, and older or seeded data and any future one-way link (for example a cliff drop) would hit this.
**Fix:** Build the neighbour set from both `by_from` and `by_to` in `passageSides` (dedupe by id). Alternatively, refuse the collapse when a `by_to` source is not also a `by_from` target. Add a test with a one-way `X -> passage` row.

### WR-02: Only travel departures collapse a passage; respawn, resurrection and character deletion leave an empty passage up to one sweep interval

**File:** `spacetimedb/src/helpers/travel.ts:270`; the other departures are `spacetimedb/src/reducers/characters.ts:306-315` (`respawn_character`), `spacetimedb/src/helpers/character.ts:268-277` (`autoRespawnDeadCharacter`), `spacetimedb/src/helpers/corpse.ts:162-169` (`executeResurrect`, which moves the target to its corpse) and `delete_character`
**Issue:** The owner rule is "when the last character leaves, it collapses". An online character who dies in a passage and respawns at their bind, gets resurrected elsewhere, or is deleted while standing there, empties the passage without the departure check. The client keeps drawing a stop that nobody occupies for up to 5 minutes. The passage then disappears on a sweep tick, not on an action, which is harder to reason about in UAT. This is not data loss, because the sweep converges.
**Fix:** Call `collapsePassageIfEmpty(ctx, previousLocationId)` after each of these relocations or deletions. They are single-character moves, so the "after all travellers" ordering concern does not apply. Add one real-handler test per path.

### WR-03: The sweep relocates offline characters even when the passage cannot collapse

**File:** `spacetimedb/src/helpers/passages.ts:251-263`
**Issue:** The loop skips a passage only when `own.length === 0`. When `far.length === 0` (for example the far start place was removed, or the generation wrote no link), every offline occupant is still moved. `collapsePassageIfEmpty` then returns false, and the passage remains. The players were displaced silently for no purpose, and this repeats for anyone who stands there and goes offline. The doc comment says "for each passage ... that has an own side". The stated purpose of the move ("stops offline characters from holding it open forever") assumes that a collapse follows.
**Fix:** Compute `{ own, far }` once and `continue` when `own.length === 0 || far.length === 0`, then add a test.

## Info

### IN-01: The sweep tick does a full scan of `location` every 5 minutes

**File:** `spacetimedb/src/helpers/passages.ts:247`
**Issue:** `[...ctx.db.location.iter()].filter(terrainType === 'passage')` walks the whole world each tick, and the world only grows. Passages are rare and short-lived.
**Fix:** Add a btree index on `location.terrainType` (an additive schema change) and use `filter('passage')`, or keep a tiny `passage` marker table.

### IN-02: Collapse re-homing uses full table scans for seven tables

**File:** `spacetimedb/src/helpers/passages.ts:112-115`, `:126-136` (character, quest_template, event_objective, vendor_buyback, search_result, event_spawn_enemy, enemy_respawn_tick)
**Issue:** The non-indexed `rowsAt` path iterates whole tables, including `character` and `quest_template`, on every collapse. Collapses are rare, so the cost is acceptable today, but it grows with the world.
**Fix:** Optional: add `by_location` or `by_bound_location` indexes where they are cheap, or leave as is with a comment acknowledging the cost.

### IN-03: `visited_location` has no (characterId, locationId) uniqueness, and each arrival does two linear scans of the character's rows

**File:** `spacetimedb/src/helpers/visited.ts:55-60`, `spacetimedb/src/helpers/travel.ts:171-172`, `spacetimedb/src/schema/tables.ts:2329-2343`
**Issue:** One row per pair is enforced only by `markLocationVisited` checking first. Any future write path that inserts directly can create duplicates. `visitedRowFor` iterates every visited row of the character, twice per traveller per move.
**Fix:** Add a two-column btree index `by_character_location` on `['characterId', 'locationId']`. Composite prefix and exact filters are supported on 2.10. Look the row up through that index.

### IN-04: `fromLocationId` and `world_gen_state.sourceLocationId` keep dangling ids after a collapse, and the client can read the former

**File:** `spacetimedb/src/helpers/passages.ts:73-78`; pinned by `travel_passage.integration.test.ts:104` (`fromLocationId: 6n` after place 6 is deleted)
**Issue:** This is documented as "history", but `my_visited_locations` ships `fromLocationId` to the client, where it can point at a location row that no longer exists. Any client code that resolves it must tolerate a miss.
**Fix:** Either re-home `visited_location.fromLocationId` to the own-side home as well (the sweep only uses it for rows at a passage), or document in `views/visited.ts` that `fromLocationId` may reference a deleted place.

### IN-05: The sweep re-arms only inside the transaction, so a deterministic throw in `sweepPassages` can stall the chain

**File:** `spacetimedb/src/index.ts:423-430`
**Issue:** The re-arm insert and the work share one transaction. If `sweepPassages` ever throws (for example a future rehome entry that calls `.update` on a column index that does not exist), the re-arm rolls back too. The chain then stops until the next `clientConnected` arms a tick "due now", which hits the same throw again. This matches the existing restock and inactivity pattern, so it is consistent, but nothing reports it.
**Fix:** Keep the pattern, and add a test that runs `sweep_passages` against a world with every `PASSAGE_LOCATION_COLUMNS` table populated at the passage, so a throw shows up in CI and not on the live tick. Optionally log a `console.error` breadcrumb from a guarded wrapper.

### IN-06: The redundant branch in the collapse relinking

**File:** `spacetimedb/src/helpers/passages.ts:223-231`
**Issue:** The `if` and `else` branches have the same effect: `ensureLink` in both directions writes exactly what `connectLocations` writes when neither link exists. The extra branch adds four connection scans per pair and obscures the intent.
**Fix:** Replace the body with `ensureLink(ctx, ownPlace.id, farPlace.id); ensureLink(ctx, farPlace.id, ownPlace.id);`.

### IN-07: World event enemies at a passage are deleted while their items and objectives are re-homed

**File:** `spacetimedb/src/helpers/passages.ts:57`, `:67`, `:146-150`, `:175-177`
**Issue:** `event_objective` and `event_spawn_item` move to `own[0]`, but the `event_spawn_enemy` and `enemy_spawn` rows backing a kill objective at the passage are deleted. A cull objective located there becomes unachievable until the event times out. The impact is low today, because events resolve places by seeded name (`world_events.ts:111-117`) and 51.2 replaces them.
**Fix:** Either re-home event enemy spawns too (update `enemy_spawn.locationId` and `event_spawn_enemy.locationId` for rows with an `event_spawn_enemy` link), or note in the classification comment that 51.2's generated events must never choose a `passage` place.

### IN-08: The coverage test's table-name detection is a line regex over the schema source

**File:** `spacetimedb/src/helpers/passages.test.ts:330-337`
**Issue:** `/name: '([a-z_]+)'/` also matches comment lines or string defaults containing `name: '...'`. The column regex misses location references under other names (for example a future `homeId` or `destinationId`). It is a useful tripwire but not proof of coverage. The hard-coded `toHaveLength(26)` and `[11, 8, 3, 3, 1]` also make every intended schema change a two-place edit.
**Fix:** Optional: derive columns from the recorded schema (the `schema_recorder` mock already captures `table()` calls) instead of the source text.

### IN-09: (out of phase, pre-existing) The private-table protection is only as strong as `login_email`

**File:** `spacetimedb/src/reducers/auth.ts:27-48`
**Issue:** `my_visited_locations` correctly filters by `ctx.sender`. However, `login_email` binds any identity to any email without verification, and `requireCharacterOwnedBy` then accepts that identity's `set_active_character`. Anyone who knows a player's email can make the character active and read its visited places, along with every other `my_*` view. This predates Phase 51; 51.1 is scheduled to rework `user` privacy.
**Fix:** Track it for 51.1: bind `user` to the authenticated identity (or to a verified token claim), not to a client-supplied email.

## Notes (no finding)

- Phase 50 fixes in range (`craftBatchFits`, `maxCraftCount` with a room, salvage roll indexes, `writeActionResult` plain Error): verified against `addItemToInventory` (merges into the first non-equipped stack) and `planCraft` (consumes merged per templateId). `maxCraftCount` stops at the first failing n, which is conservative: the stepper may under-offer but never over-offers.
- `describeNeighbourPlace` and `describeBindStone` read only public tables and the caller's own character, so there is no cross-identity leakage. Placing them last keeps every older answer unchanged.
- `onlineCharacterIds` considers a disconnected character online for up to 30 s (until `disconnect_logout`). This is acceptable for a 5-minute sweep.

---

_Reviewed: 2026-10-07T10:10:03Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
