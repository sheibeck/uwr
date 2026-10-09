# Phase 51.3.1.2 Bigger Regions: deferred items

Owner rule: UAT is deferred to the milestone end. None of these blocks this phase. Each check is run by the owner at the milestone-end UAT.

## Owner deferrals (2026-10-09)

- **Proof cost-bound check and the paid proof are deferred until all systems are in place** (Phase 52.5 / milestone end). After D-19 (`REGION_CREATION_MAX_TOKENS = 20000` shared by world_gen_start, world_gen, world_gen_families and region_economy), the free dry-run worst-case bound is $2.6669 (2,666,937 micro-USD), over the $1.80 stop line. The "under the stop line" assertion in `scripts/llm/proof_rules.test.mjs` is `it.skip` until then; a running test still prints the bound.
- **Fix before ANY paid run:** `.planning/todos/pending/2026-10-09-live-proof-writes-to-archived-phase-folder.md`. `prove-live.live.ts` writes to the archived Phase 44 folder, so a paid run would throw ENOENT on its first `record()` after spending money. The same stale path is the baseline collection failure of `proof_rules.test.mjs` and `call_log_report.test.mjs`. Free to fix (dry run only).
- **Cosmetic gap (Plan 13):** a second new character that is HELD on a starter region still being built sees the 7e line on his creation console but no moving progress lines, because he has no job of his own (the indicator follows the player's own jobs). Same text, idle indicator. Revisit with the creation console UX.

## Human checks for the milestone-end UAT

### 1. D-12 paid region measurement (owner-run, about $0.15, plus the late loot calls)

Before: fix the todo above (live proof writes to the archived phase folder).

Steps:
1. With aiEnabled on, generate one new region locally (travel onto an uncharted Edge Beyond place, or create a new character of a new race).
2. Read the input/output token counts and latency of the four calls: world_gen_start, world_gen (2a, places and people), world_gen_families (2b) and region_economy (`/llm stats` or the call log). Also note the late-family loot jobs (one per family past 7).
3. Set the four budgets from the measurement. D-19 currently gives all four the shared cap `REGION_CREATION_MAX_TOKENS = 20000`; per-route budgets and dials come in Phase 52.5.

Expected: each call completes without truncation; 2a output well under the old estimate of 6656 tokens, 2b under 7168, region_economy under 6144; total cost of the region near $0.12-0.14 plus about $0.03-0.04 of late loot calls.

### 2. Feel check of an 8-10 place region

Steps:
1. Walk the region generated in check 1 (or any region generated after this phase).
2. Open the map at desktop and mobile widths.

Expected:
- 8 to 10 places counting the arrival point (the Edge Beyond doorway not counted), all reachable.
- Hub distance feels right (D-07: usually one hub; a second hub is rare).
- Levels rise by one for every two hops from the arrival point, at most +2 (D-04).
- The map stays readable with 10 places, including a place with up to 6 routes (4 in-region exits plus a passage and a doorway).
- The onward Edge Beyond doorway hangs off the farthest place.

### 3. The hold at the crossing (7a to 7d)

Steps:
1. Travel onto an uncharted Edge Beyond place so a new region starts generating.
2. Watch the lines on arrival at the crossing.
3. Try to travel into the new region before it opens.
4. Wait for it to open.
5. For a forced families failure: make the families call fail (for example switch the AI off between 2a and 2b, or let the sweeper release a stranded families job), then type `[explore]` at the crossing.

Expected:
- 7a on arrival: "You stand at the edge of the known world, preparing to travel into an unknown region. The sky beyond is darkening."
- 7b on an early travel attempt (refused with the weather line); travel back toward the old region still works.
- 7c when it opens, naming the region, followed by the discovery line; travel into the region now works.
- A families failure (FAMILIES_ERROR) shows 7d at the crossing; `[explore]` there retries only the families call (no second set of places), and the region opens with 7c when it lands.

### 4. A new character waits in creation

Steps:
1. Create a new character of a race whose starter region does not exist yet.
2. During the wait, create a second character of the same race (another account).

Expected:
- The first character waits on the creation console with the progress lines and the 7e line, and is not placed after stage 1.
- When the families land, he is placed at the arrival point with the arrival message ending "Try [look] to examine your surroundings, or [travel] to move.", then the discovery line.
- The second character is HELD: he sees 7e (no moving progress lines, the cosmetic gap above) and is placed at the region's home place when the families land.
- A failure on either stage shows the creation retry line; `[explore]` restarts only the failed stage.

### 5. World_gen_state rows that were FILL_ERROR or FAMILIES_ERROR at publish

Listing taken before the local publish on 2026-10-09 (`SELECT id, step, sourceLocationId, generatedRegionId FROM world_gen_state`):

| id | step | sourceLocationId | generatedRegionId |
|----|------|------------------|-------------------|
| 4098 | COMPLETE | 0 | 1 |
| 1 | COMPLETE | 0 | 1 |
| 4097 | COMPLETE | 6 | 4097 |
| 4099 | COMPLETE | 4101 | 4098 |
| 4100 | COMPLETE | 4107 | 4099 |

None was FILL_ERROR or FAMILIES_ERROR, so no older region is held by this publish. If such a row appears before the world is regenerated: the region is held until someone types `[explore]` at its crossing, and a FILL_ERROR retry writes up to the new 8-10 places into that older region. The owner may prefer to leave it, since the world will be regenerated.

Expected: nothing to do for this database; the listing above is unchanged after the publish (see below).
