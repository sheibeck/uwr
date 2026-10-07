---
phase: 51-ledger-screens-world-and-people
plan: 05
subsystem: ui
tags: [vue, map, travel, checks, detail, pure, tdd, client]
status: complete

requires:
  - phase: 51-ledger-screens-world-and-people
    provides: "51-01 travelStaminaCost and travelEffectDiscount (@game-data/travel_config); 51-02 map helpers (danger, terrain, travelTimer, route, regionChips)"
provides:
  - "src/map/travelChecks.ts: travelChecks (followers, costs, checklist rows, blocking order)"
  - "src/map/detailModel.ts: buildDetail and travelAction (the whole destination detail and the one Travel button)"
affects: [51-07, 51-09, 51-10, 51-11]

tech-stack:
  added: []
  patterns:
    - "Prediction models compose the shared server rule and the 51-02 helpers; the server re-checks every trip"
    - "View models return plain strings only (text nodes and bound attributes); colours are CSS tokens"

key-files:
  created:
    - src/map/travelChecks.ts
    - src/map/travelChecks.test.ts
    - src/map/detailModel.ts
    - src/map/detailModel.test.ts
  modified: []

key-decisions:
  - "A region timer blocks only crossings; the same destination inside your region never blocks"
  - "Followers are counted only when you lead, from members with followLeader on whose character row is known and stands at your place (and not already at the destination, as on the server)"
  - "Crossing block and region line use the destination REGION's level range and band over the places you know (regionChips), matching the gate pills"
  - "The far-place route chain includes your own place as its first step, so '{n} stops' equals steps minus one; crossingInto marks the first step in a new region"
  - "An uncharted neighbour always gets 'Travel to {place}' (no crossing block, no Cross label), even if its region row differs"
  - "Bind tag: 'Your bind point' (accent-300) wins when boundLocationId is the place, else 'Bind stone' when the place has one"
  - "Related quests reuse trackedQuests (countText, order); one card per quest, roles joined with ' · '"
  - "An unknown selection falls back to your place; with no place at all the view is empty"
  - "Offline keeps the (blocked or normal) label, disables the button, drops describedBy and the note; Select first stop stays enabled because it only selects"

requirements-completed: [LDG-05]

coverage:
  - id: D1
    description: "travelChecks predicts followers, per-traveller cost (shared rule, parity-tested), checklist rows and the blocking order"
    requirement: "LDG-05"
    verification:
      - kind: unit
        ref: "src/map/travelChecks.test.ts (23 tests, incl. parity with travelStaminaCost and a source guard)"
        status: pass
    human_judgment: false
  - id: D2
    description: "buildDetail and travelAction give every destination kind one description, checklist and button in the UI-SPEC words"
    requirement: "LDG-05"
    verification:
      - kind: unit
        ref: "src/map/detailModel.test.ts (label-set guard, blocked states, uncharted, passage, heard-of, far, no path, services, players, quests, escape case)"
        status: pass
    human_judgment: false

duration: ~25min
completed: 2026-10-07
---

# Phase 51 Plan 05: Travel checks and destination detail model Summary

**Two pure models: travelChecks predicts who travels, what it costs (from the server's own stamina rule) and what blocks it; buildDetail/travelAction turn that into the whole destination detail and the one Travel button.**

## Commits

| Task | RED | GREEN | REFACTOR |
|------|-----|-------|----------|
| 1 travelChecks | 132d2659 | 90056854 | 8ab9f183 |
| 2 buildDetail / travelAction | 1e66e378 | 4bb561c6 | none needed |

## Accomplishments

- `travelChecks` imports `travelStaminaCost` and `travelEffectDiscount` through `@game-data/travel_config`; nothing is copied and the cooldown length is never read (source-guard test plus the existing mapGuards).
- Block order verified by pairwise tests: gathering, your timer, a follower's timer, your stamina, a follower's stamina.
- `buildDetail` covers here, same-region neighbour, other-region neighbour (crossing block), uncharted, passage, heard-of, far (with route) and no-path destinations; a label-set guard proves the only button labels are Travel to, Cross into, Region travel in, Not enough stamina, Finish gathering first and Select first stop.

## Verification

- `pnpm exec vitest run src/map`: 11 files, 215 tests pass (before the last test-file edit; re-run clean after).
- `npx vue-tsc -b`: exit 0.
- Full `npx vitest run` from the repo root: 298 files pass; only the three baseline failures (scripts/llm/call_log_report.test.mjs, scripts/llm/proof_rules.test.mjs, spacetimedb/src/helpers/measurement.results.test.ts).
- No publish, no bindings change.

## Deviations from Plan

None - plan executed as written. Planner decisions in the plan were followed (names joined with ', ' and ' and ', uncharted follower note, one Passage tag, roles joined with ' · ', no teleport action).

## Exports for later plans

- `src/map/travelChecks.ts`: `TravellerLike`, `TravelCheck`, `TravelBlock`, `TravelChecks`, `TravelChecksInput`, `travelChecks(input)`. Input `characters` must be known party rows (stamina, locationId, racial fields); `cooldowns` are travel_cooldown rows for you and the party (from the map hub, 51-07); `nowMicros` is `game.clock.nowMicros()`; `gathering` true when the active character has a gather row.
- `src/map/detailModel.ts`: `DetailLocation`, `DetailRegion`, `DetailQuestRow`, `DetailQuestTemplate`, `DetailKind`, `TravelAction`, `TravelActionInput`, `DetailTag`, `DetailView`, `BuildDetailInput`, `travelAction`, `buildDetail`.
  - Pass `checks` only for the selected neighbour (null otherwise); buildDetail ignores checks for other kinds. `connected` is the live server connection.
  - Timer buttons: visible text is `label` + ' ' + `timeText` (the clock is aria-hidden); `ariaLabel` is the spoken sentence; `title` has the full text.
  - Far-place action is `kind: 'firstStop'` with `firstStopId`; the component only selects that node, never calls move_character.
  - `route.steps` starts with your own place; render the chain with the door mark where `crossingInto` is set (sr text ', then crossing into {Region},').
  - `trip.regionTravel.tone`: 'neutral' | 'text' | 'wait'; `trip.services` is `{ items, text }` (text 'None' or 'Unknown until you visit', else null).
  - Players count excludes you and includes offline characters (until 51.1).

## Known Stubs

None.

## Threat Flags

None. Strings are plain data (T-51-21 escape case covered by test); costs come from the shared rule with parity tests (T-51-23).

## Self-Check: PASSED

- src/map/travelChecks.ts, travelChecks.test.ts, detailModel.ts, detailModel.test.ts exist.
- Commits 132d2659, 90056854, 8ab9f183, 1e66e378, 4bb561c6 exist.
