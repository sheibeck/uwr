---
phase: 48-combat-encounter
plan: 02
subsystem: combat
tags: [vue-client, pure, combat, encounter, tdd]
status: complete
requires: ["48-01"]
provides:
  - "conFor: level-difference difficulty (class, token name, meaning word)"
  - "windup helpers: one sentence builder with the live-round and announcement-round N rules"
  - "hostileViews, livingHostileIds, encounterHeading: rail, strip and sheet rows"
  - "threatView: sorted threat rows, bigint round-half-up percent relative to the top row"
  - "nextTargetId: Tab cycling from the last requested target with wrap"
  - "allyTargetFor, allyResetNeeded: the ally argument and reset rules"
affects: [48]
tech-stack:
  added: []
  patterns: ["pure derivation modules beside unit tests; components later render text nodes only", "typed single_ally constant against TargetRule from @game-data so a server rename breaks vue-tsc"]
key-files:
  created:
    - src/combat/difficulty.ts
    - src/combat/difficulty.test.ts
    - src/combat/windup.ts
    - src/combat/windup.test.ts
    - src/combat/hostiles.ts
    - src/combat/hostiles.test.ts
    - src/combat/threat.ts
    - src/combat/threat.test.ts
    - src/combat/cycling.ts
    - src/combat/cycling.test.ts
    - src/combat/ally.ts
    - src/combat/ally.test.ts
  modified: []
key-decisions:
  - "hostileViews widthPercent rounds to two decimals ('44.17%') so floating-point noise never reaches the style binding; percent (whole number) feeds aria and labels"
  - "The hostile aria-label names the first wind-up's ability (casts ordered by cast id) when an enemy has several casts"
  - "threatView returns an empty heading while hidden; the heading exists only when visible"
  - "allyResetNeeded takes no status, so a dead ally with a participant row and party membership stays selected by construction"
requirements-completed: [CMB-01, CMB-02, CMB-03, CMB-05]
metrics:
  tasks: 3
  files: 12
  completed: 2026-10-06
---

# Phase 48 Plan 02: Pure encounter modules Summary

Six pure modules under `src/combat/` now derive everything the encounter rail needs (difficulty color, hostile rows, wind-up copy, threat rows, Tab cycling, ally-target rule), each beside a unit test. No Vue component, no game-data wiring, no server or bindings change.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Difficulty and wind-up copy | 0f1c7e34 | src/combat/difficulty.ts, difficulty.test.ts, windup.ts, windup.test.ts |
| 2 | Hostile rows and the threat block | 6ec2a547 | src/combat/hostiles.ts, hostiles.test.ts, threat.ts, threat.test.ts |
| 3 | Tab cycling and the ally-target rule | e0fcd018 | src/combat/cycling.ts, cycling.test.ts, ally.ts, ally.test.ts |

Each task was written test and implementation together and committed once (the plan's task-level `tdd` flag; the plan type is `execute`, so no plan-level RED/GREEN commit gate applies).

## What was built

- `difficulty.ts`: `conFor(enemyLevel, playerLevel)` with bigint thresholds (<= -5 Trivial, -4..-2 Easy, -1 Slightly easy, 0 Even match, 1 Tough, 2 Hard, >= 3 Deadly). A missing level reads as diff 0. The token string is `--color-con-*`; no color value or `var()` lives in the module.
- `windup.ts`: `landsInLive` (rail, `landsAtRound - currentRound + 1`) and `landsInAtAnnouncement` (feed, `landsAtRound - announcedRound`), both clamped to 1; `windupParts` builds lead, ability, tail and full text with `→` and `·` as text characters and 'lands this round' at N <= 1; `windupTarget` ('you', member name, pet name, 'the party'); `enemyAbilityName` (falls back to the key with underscores as spaces).
- `hostiles.ts`: `hostileViews` (ascending id, template lookup, `Lv n`, boss only for `isBoss === true`, HP text, clamped width, defeated never targeted, per-enemy wind-ups ordered by cast id, aria-label and title), `livingHostileIds`, `encounterHeading` ('Encounter · 1 hostile' / 'n hostiles').
- `threat.ts`: `threatView` filters to the target enemy, sorts by value descending then character id ascending, percent `(value*200 + top) / (2*top)` in bigint (relative to the top row), 'You' for self, 'Member' for unknown, hidden without a target or before the view applies, 'No threat yet.' when applied and empty.
- `cycling.ts`: `nextTargetId` bases on the last requested id, else the current id (each only if living); wraps; null for no living hostile or a single living hostile that is already the base.
- `ally.ts`: `allyTargetFor` sends the id only for `single_ally`, an `active` participant row and HP above 0; `allyResetNeeded` resets when the fight is not active, the ally has no participant row, or the ally is not in the party. The rule name is a `TargetRule`-typed constant imported from `@game-data/mechanical_vocabulary`.

## Verification

- `pnpm exec vitest run src/combat src/gameDataAlias.test.ts`: 7 files, 95 tests passed.
- `pnpm exec vue-tsc -b`: exit 0.
- Full client suite `pnpm exec vitest run --dir src --maxWorkers=2`: 84 files, 1463 tests passed (48-01 baseline was 78 files, 1372 tests; the difference is the six new test files). No new failures.
- `pnpm build` was not required by this plan (no component or entry change) and was not run.
- Acceptance greps hold: difficulty.ts contains `Slightly easy`, `Even match`, `Deadly`; windup.ts contains `lands this round` and `the party`; hostiles.ts contains `Encounter · ` and `winding up`; threat.ts contains `No threat yet.` and `Threat on `; ally.ts contains `@game-data/mechanical_vocabulary` and `single_ally`.

## Pinned assertions in earlier phases

None changed. This plan only adds new files; no Phase 45/47 test or GameData / COMBAT_KEY field was touched, so no inert defaults were needed.

## Deviations from Plan

None. The plan executed as written. Small choices inside the plan's latitude are listed under key-decisions (two-decimal width string, first ability in the aria-label for multiple casts, empty heading while hidden).

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. T-48-07 is covered by `<img onerror>` names in the windup, hostiles and threat tests (each comes back as the same plain string; strings are built by concatenation only). T-48-09 is covered by the allyTargetFor refusal tests (dead, HP 0, unknown HP, no participant row, wrong rule, no selection). T-48-08 is accepted as planned.

## Flagged assumptions (carried for the verifier)

- CMB-01, CMB-02, CMB-03, CMB-05 edge probes (unclassified): reviewed by hand and pinned by tests (every difficulty boundary, hostile ordering and clamps, the N clamp for a landing round behind the open round, threat ties and rounding, cycling wrap and single hostile, ally refusal cases and selecting the player themself).
- A8 (threat percent relative to the top entry) stays unresolved for the owner at UAT; only `threat.ts` changes if the basis changes.
- An unknown wind-up target character reads 'the party'; this is transient until plan 04 subscribes the fight's participants.

## Deferred owner verification

No hands-on check is needed for this plan (pure modules only). The owner-facing items appear when the components land: at UAT, confirm the threat percent basis (A8) and that difficulty colors, wind-up wording and Tab cycling read as expected in a real fight.

## Self-Check: PASSED

- FOUND: src/combat/{difficulty,windup,hostiles,threat,cycling,ally}.ts and the six matching .test.ts files
- FOUND commits: 0f1c7e34, 6ec2a547, e0fcd018
