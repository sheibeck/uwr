---
phase: 51-ledger-screens-world-and-people
fixed_at: 2026-10-07T10:40:00Z
review_path: .planning/phases/51-ledger-screens-world-and-people/51-REVIEW-server.md
extra_review_items: ".planning/phases/51-ledger-screens-world-and-people/51-REVIEW-client-rest.md (WR-06, IN-09: server items)"
iteration: 1
findings_in_scope: 15
fixed: 9
documented: 5
out_of_scope: 1
status: all_fixed
---

# Phase 51: Code Review Fix Report (server)

**Fixed at:** 2026-10-07T10:40:00Z
**Source review:** `51-REVIEW-server.md` (CR-01, WR-01 to WR-03, IN-01 to IN-09), plus the two server items from `51-REVIEW-client-rest.md` (WR-06, IN-09) that the coordinator added.
**Iteration:** 1

**Summary:**
- In scope: 15 (13 server findings and 2 client-rest server items).
- Fixed in code: 9 (CR-01, WR-01, WR-02, WR-03, IN-03, IN-04, IN-06, IN-07, client-rest WR-06).
- Documented or kept by decision, with a code comment or a pinning test: 5 (IN-01, IN-02, IN-05, IN-08, client-rest IN-09).
- Out of scope: 1 (IN-09 `login_email`, which is already a tracked todo).

I worked in the main tree with explicit-path commits, as the coordinator asked, and did not use the fixer's worktree flow. Every commit lists only its own files. I touched nothing under `src/`.

## Fixed Issues

### CR-01: The sweep moved offline characters out of an active fight, and the collapse re-homed the live encounter

**Files:** `spacetimedb/src/helpers/passages.ts`, `spacetimedb/src/helpers/passages.test.ts`, `spacetimedb/src/reducers/passage_sweep.integration.test.ts`
**Commits:** `cf4c18c2`, `d40850bb`
**Applied fix:**
- `sweepPassages` skips any occupant for which `activeCombatIdForCharacter` (imported from `./events`) returns a combat.
- `collapsePassageIfEmpty` returns false and changes nothing while a `combat_encounter` at the passage has `state === 'active'` (new private `hasActiveEncounterAt`, which reads through `by_location`).
- `d40850bb`: the sweep now also skips the whole passage while a fight is active there. Without this, an offline bystander who is not in the fight would be moved even though the passage cannot collapse yet (the WR-03 rule).

A resolved encounter is history and is re-homed as before.

**Tests (real `sweep_passages` handler):**
- An offline occupant in an active fight stays, and the passage, the encounter's location and the locked enemy spawn are unchanged.
- An empty passage with an active encounter does not collapse.
- An offline bystander is not moved while the fight goes on.
- After the encounter is set to `resolved`, the next tick moves the occupant to the own side and collapses the passage. The encounter is re-homed.
- Unit test: `collapsePassageIfEmpty` with an active encounter returns false and the db is unchanged byte for byte.

**RED:** 4 failing before the fix.

### WR-01: A one-way neighbour was stranded by the collapse

**Files:** `spacetimedb/src/helpers/passages.ts`, `spacetimedb/src/helpers/passages.test.ts`
**Commit:** `262c3b1f`
**Applied fix:** `passageSides` builds the neighbour set from both `location_connection.by_from` (follow `toLocationId`) and `by_to` (follow `fromLocationId`), and dedupes by id. A place whose only link was `X -> passage` is now on its side and gets both directed crossing rows.

**Decision:** a one-way link becomes a two-way border crossing, as the reviewer suggested. The alternative, composing only the directed paths, could still strand a place whose links all point into the passage.

**Tests:** `passageSides` counts inbound-only neighbours on both sides. A collapse with a one-way `3 -> 6` row yields `3>4097` and `4097>3`. **RED:** 2 failing before the fix.

### WR-02: Only travel collapsed a passage

**Files:** `spacetimedb/src/helpers/passages.ts`, `spacetimedb/src/helpers/character.ts`, `spacetimedb/src/helpers/corpse.ts`, `spacetimedb/src/reducers/characters.ts`, `spacetimedb/src/reducers/travel_passage.integration.test.ts`
**Commit:** `24e79524`
**Applied fix:** one shared helper, `collapsePassageAfterLeaving(ctx, previousLocationId, newLocationId?)`, exported from `helpers/passages.ts`. It does nothing when the place is unset or 0n, or when the new place equals the old one; otherwise it calls `collapsePassageIfEmpty`. It is called from:
- `respawn_character`, after the move.
- `autoRespawnDeadCharacter`. This function is wired into deps but has no production caller today; it is hooked anyway.
- `executeResurrect`, from the target's old place.
- `delete_character`, after the row is deleted.

Performance is unaffected because the helper's first call is a `location.id.find`, which leaves at once for a place that is not a passage.

**Tests:**
- The real `respawn_character` handler collapses the passage, and a second occupant keeps it open.
- The real `delete_character` handler collapses the passage.
- `autoRespawnDeadCharacter` and `executeResurrect` collapse the passage. These two are tested through the real helpers, because resurrection runs inside the cast tick.

**RED check:** with the helper body temporarily set to `return false`, 4 of these tests failed. The body was then restored from a scratch copy, not with git.

### WR-03: The sweep displaced occupants of a passage that cannot collapse

**Files:** `spacetimedb/src/helpers/passages.ts`, `spacetimedb/src/reducers/passage_sweep.integration.test.ts`
**Commits:** `630ab8c0`, plus the active-fight part in `d40850bb`
**Applied fix:** the sweep computes `{ own, far }` once and skips the passage when either side is empty, or (from `d40850bb`) while a fight is active there.
**Test:** a passage with own-side links but no far side keeps its offline occupant, and returns `{ moved: 0, collapsed: 0 }`. **RED:** 1 failing before the fix.

### IN-03: One visited row per character and place

**Files:** `spacetimedb/src/helpers/visited.ts`, `spacetimedb/src/helpers/visited.test.ts`
**Commit:** `35167730`
**Applied fix:** there is no schema change. A private `visitedRowsFor` reads through `by_character` and sorts by id.
- `visitedRowFor` returns the lowest-id row.
- `markLocationVisited` deletes any duplicate rows for the pair and keeps the lowest-id row before it inserts or updates.

**Tests:**
- Duplicates are removed and the first row is kept, with its origin.
- `visitedRowFor` returns the lowest id.
- A source test walks every non-test `.ts` file under `spacetimedb/src` and requires that only `helpers/visited.ts` contains `visited_location.insert(`. This pins the single-writer rule the reviewer was worried about.

**Not done:** a two-column index. The coordinator's instruction ruled out a schema change. The double `by_character` scan per traveller in `performTravel` stays; it reads one character's rows only.

### IN-04: `fromLocationId` pointed at the deleted passage

**Files:** `spacetimedb/src/helpers/passages.ts`, `spacetimedb/src/helpers/passages.test.ts`, `spacetimedb/src/views/visited.ts`, `spacetimedb/src/reducers/travel_passage.integration.test.ts`
**Commits:** `c3db8c76` and `474575f3`
**Applied fix:** `visited_location.fromLocationId` moves from the `keep` class to `rehome` in `PASSAGE_LOCATION_COLUMNS`. The counts are now 13 / 7 / 2 / 3 / 1, still 26 columns. An arrival from the passage always lands on one of its neighbours, so the collapse reads `visited_location.by_location` for each own-side and far-side neighbour, with no scan:
- A far-side row whose origin was the passage now names the own-side home, which the collapse links to it.
- An own-side row loses its origin (`undefined`), because the crossing does not run between own-side places.

`views/visited.ts` documents that a client must still tolerate a miss when it resolves the id. `world_gen_state.sourceLocationId` stays as history.

**Tests:** far-side, own-side, untouched and origin-less rows. The old "history is kept" test now covers only `world_gen_state`.

**Process note:** `c3db8c76` was committed while `travel_passage.integration.test.ts` still pinned `fromLocationId: 6n` on the own-side row; my commit helper did not gate on the test result. `474575f3` updates that expectation to `undefined`, the intended IN-04 behaviour. Every later commit was made only after a green run.

### IN-06: Redundant relink branch

**File:** `spacetimedb/src/helpers/passages.ts`
**Commit:** `83d8a43f`
**Applied fix:** each own/far pair is relinked with `ensureLink(own, far)` and `ensureLink(far, own)`. `connectLocations` is no longer imported. The behaviour is identical: `connectLocations` inserts the same two rows in the same order. All existing edge tests stay green.

### IN-07: World event enemies were deleted while their objectives were re-homed

**Files:** `spacetimedb/src/helpers/passages.ts`, `spacetimedb/src/helpers/passages.test.ts`
**Commit:** `935ecc14`
**Applied fix:**
- An `enemy_spawn` at the passage that has an `event_spawn_enemy` link (found through `by_spawn`) is re-homed to the own-side home, and its `enemy_spawn_member` rows are kept.
- Ordinary spawns are deleted as before.
- Every `event_spawn_enemy` row at the passage is re-homed, including one whose enemy was already killed, since the event's despawn still walks it by event.

`event_spawn_enemy.locationId` moves to the `rehome` class, and the `enemy_spawn` comment notes the exception. A kill objective and its enemies therefore end up at the same place.

**Tests:**
- An event spawn moves with its member and link, the objective goes to the same place, and an ordinary spawn is deleted.
- An orphan link is re-homed, and links elsewhere stay.
- The `event_spawn_enemy` case was removed from the "deleted" `it.each`.

**RED:** 3 failing before the fix.

### client-rest WR-06: `bind_location` had no combat check

**Files:** `spacetimedb/src/reducers/characters.ts`, `spacetimedb/src/reducers/bind_location.integration.test.ts` (new; no existing file differs only in case)
**Commit:** `716d0741`
**Applied fix:** `bind_location` calls `fail(ctx, character, 'You cannot bind while in combat.')` and returns while `activeCombatIdForCharacter` is set. The wording is the same as the `bind` intent's.
**Tests (real handler):** refused in an active fight, with the old bind point kept and exactly that message; binds out of combat; a resolved fight does not block. **RED:** 1 failing before the fix.

## Documented or kept by decision

### IN-01: The sweep reads the whole `location` table each tick

**Commit:** `ee2f633f` (comment only)
`location` has no index on `terrainType`. I did not add one: I could not confirm that SpacetimeDB 2.10 auto-migration adds an index to an existing table without asking for a clear. The coordinator's rule was to skip it if unsure, and the change would also have meant regenerating the client bindings under `src/` while client agents are active. The cost is one table read per 5-minute tick, which is accepted and noted at the call site. A follow-up can add a `by_terrain_type` btree, or a small passage marker table (a new table, which is safely additive), after a trial publish confirms the migration plan.

### IN-02: The collapse scans tables without a location index

**Commit:** `ee2f633f` (comment on `rowsAt`)
I checked every non-indexed `rowsAt` call: `character.boundLocationId`, `quest_template`, `event_objective`, `vendor_buyback`, `search_result`, `event_spawn_enemy` and `enemy_respawn_tick`. None of them has an index on the location column, and every table that has `by_location` already uses it. The only new reads added in this pass go through indexes: `visited_location.by_location` per neighbour for IN-04, and `event_spawn_enemy.by_spawn` for IN-07. I added no indexes, for the IN-01 reason. A collapse happens once per explored edge, so the cost is accepted and documented in the code.

### IN-05: The sweep's re-arm shares the work transaction

Documented only. This is the same pattern as restock and inactivity. Every rehome and delete path in `passages.ts` now runs in a test against the strict mock, which throws on an unknown accessor: `passages.test.ts` plus `passage_sweep.integration.test.ts`. A future bad `.update` accessor would fail in CI. A combined "every table populated" sweep test or a `console.error` breadcrumb is left as optional.

### IN-08: The coverage test uses a line regex over the schema source

Documented only. It stays a tripwire. The hard-coded counts were updated to `[13, 7, 2, 3, 1]` (26 columns) by IN-04 and IN-07. Deriving the columns from the schema recorder is optional future work.

### client-rest IN-09: Look can match another category before a neighbouring place

**Commit:** `2332df38` (doc comment and test)
**Decision: keep the order.** The neighbouring place and the bind stone were placed last so that no older answer changes, and existing tests pin this (for example "an NPC named like a neighbouring place answers before the place").
- A place's own exact name already beats every partial NPC, enemy or item match. A new test pins this: NPC "Gloamwood Warden" and item "Gloamwood Bark", `look at gloamwood`, gives the place.
- Only an exact same-name collision resolves to the earlier category.
- If that ever matters, the remedy is a typed look target sent by the Examine eye (for example `look at place {name}`). That is a client and intent change for the later client pass. It is documented in the `describeLookTarget` comment.

## Out of scope

### IN-09: The private tables are only as strong as `login_email`

Not changed. This predates Phase 51 and is already a tracked todo (CR-01 `login_email`, reworked in 51.1).

## Verification

- Touched tests: `passages.test.ts`, `passage_sweep.integration.test.ts`, `travel_passage.integration.test.ts`, `visited.test.ts`, `visited_arrivals.test.ts`, `travel_visited.integration.test.ts`, `views/visited.test.ts`, `examine.test.ts`, `look_intent.test.ts`, `bind_location.integration.test.ts`, `scheduled_guard.integration.test.ts`. All pass.
- `npx vue-tsc -b`: exit 0, no output.
- Full `npx vitest run` from the repo root: 325 files and 9787 tests. 9785 tests pass. The only failures are the 3 known baseline files (`scripts/llm/call_log_report.test.mjs`, `scripts/llm/proof_rules.test.mjs`, and `spacetimedb/src/helpers/measurement.results.test.ts` with 2 tests).
- `tsc -p spacetimedb` shows only pre-existing errors (test-file node types, and the implicit-any reducer callbacks already present on every `spacetimedb.reducer` line). None comes from these edits.

## Publish (local only)

- **Key before:** `spacetime sql uwr "SELECT * FROM admin_llm_status" --server local` gave `key_set true | key_length 108`, and the `grep -qE "true +[|] +108"` check passed.
- **Publish:** `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null` exited 0 with `Updated database with name: uwr, identity: c200f2029b92b15e2164adf6951b34cc614ea4063d36996c58cac1799244c14a`. The migration plan section was empty: no table or column change, and no clear prompt. The log shows `Updated program to 75866334…` and `Database updated`, with no panic.
- **Key after:** `true | 108`, and the check passed.
- No `--clear-database`, no maincloud, no push.
- **Bindings:** not regenerated. No table, column, reducer name or reducer signature changed; only reducer and helper bodies did.
- The owner's SpacetimeDB (PID 12020) and Vite (5173) are still running, and none of my processes are left behind.
- `location` currently has no passage rows, so the live sweep has nothing to do until the next explored edge.

## For later Phase 51 work

- **New export:** `collapsePassageAfterLeaving(ctx, previousLocationId, newLocationId?)` in `spacetimedb/src/helpers/passages.ts`. Call it after any future non-travel relocation, such as a teleport ability.
- **Client:** `fromLocationId` in `my_visited_locations` never names a collapsed passage. A far-side row may now name the own-side home, and an own-side row may have lost its origin.
- **Client:** `bind_location` refuses in combat. The Nearby bind button may want to disable itself in combat for parity, which is a client concern.

---

_Fixed: 2026-10-07T10:40:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
