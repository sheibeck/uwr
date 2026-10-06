---
phase: 49-character-creation-interview
plan: 01
subsystem: spacetimedb
tags: [spacetimedb, creation, stats, race-bonus]

requires:
  - phase: 41-47
    provides: creation state machine, race_definition table, strict mock harness
provides:
  - "spacetimedb/src/data/race_bonuses.ts: one pure helper for finalize, both level-up sites and the client sheet"
  - "Race stat bonuses applied when a character is finalized and kept through level-up (D1)"
  - "Finding F1 fixed: secondaryStat 'none' no longer crashes confirm"
affects: [49-02 publish, 49-live-sheet plans]

tech-stack:
  added: []
  patterns:
    - "Shared pure helper in data/ (imports only ./class_stats) reachable through @game-data so client projection equals server math"
    - "Level-up rebuild: subtract race delta before primary/secondary detection, add it back after the class rebuild"

key-files:
  created:
    - spacetimedb/src/data/race_bonuses.ts
    - spacetimedb/src/data/race_bonuses.test.ts
    - spacetimedb/src/reducers/creation_finalize.test.ts
    - spacetimedb/src/reducers/level_up_race_bonus.test.ts
  modified:
    - spacetimedb/src/reducers/creation.ts
    - spacetimedb/src/index.ts
    - spacetimedb/src/reducers/commands.ts
    - src/gameDataAlias.test.ts

key-decisions:
  - "Helper never throws: malformed or missing bonuses give an all-zero delta, which is today's behavior exactly"
  - "Race lookup at level-up uses the existing race_definition.by_name index with character.race lowercased; no scan, no fallback"
  - "Bonuses re-clamped on read (primary 3, secondary 2) so older stored rows cannot exceed the validateRaceReply limits"

requirements-completed: [CRE-02]

coverage:
  - id: D1
    description: "Finalized stats are class base plus the stored race bonus (Saltkin dex +2 int +1 mystic: 8/10/8/10/13)"
    requirement: CRE-02
    verification:
      - kind: unit
        ref: "spacetimedb/src/reducers/creation_finalize.test.ts#stores the class base plus the race bonus"
        status: pass
    human_judgment: false
  - id: D2
    description: "Confirming a class with secondaryStat 'none' creates the character (F1)"
    verification:
      - kind: unit
        ref: "spacetimedb/src/reducers/creation_finalize.test.ts#confirms a class whose secondaryStat is 'none'"
        status: pass
    human_judgment: false
  - id: D3
    description: "apply_level_up and admin level_character keep the race bonus; no definition or no bonuses levels up as today"
    verification:
      - kind: unit
        ref: "spacetimedb/src/reducers/level_up_race_bonus.test.ts"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-10-06
status: complete
---

# Phase 49 Plan 01: Race Bonus Server Change Summary

**Race stat bonuses are now stored at finalize and carried through both level-up sites by one pure shared helper, and a class with `secondaryStat: 'none'` no longer blocks confirmation.**

## Helper exports (`spacetimedb/src/data/race_bonuses.ts`)

Imports only `./class_stats`; browser-safe, ES2020, never throws. Reachable as `@game-data/race_bonuses`.

```ts
export const RACE_PRIMARY_BONUS_MAX = 3n;
export const RACE_SECONDARY_BONUS_MAX = 2n;
export interface RaceStatBonus { stat: StatKey; value: bigint }
export interface ParsedRaceBonuses { primary: RaceStatBonus | null; secondary: RaceStatBonus | null; flavor: string | null }
export interface CreationStats { stats: Record<StatKey, bigint>; raceBonus: Record<StatKey, bigint> }
export interface StatBlock { str: bigint; dex: bigint; cha: bigint; wis: bigint; int: bigint }
export function parseRaceBonuses(json: string | null | undefined): ParsedRaceBonuses
export function raceBonusDelta(json: string | null | undefined): Record<StatKey, bigint>
export function computeCreationStats(primaryStat: string | null | undefined, secondaryStat: string | null | undefined, raceBonusesJson: string | null | undefined): CreationStats
export function levelUpBaseStats(character: StatBlock, level: bigint, raceBonusesJson: string | null | undefined): CreationStats
```

## Tasks and commits

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1. Shared helper + tests + alias test | 383a3e87 | 15 helper tests, +2 alias tests (alias now 6 total) |
| 2. Finalize uses the helper | 18464629 | creation.ts: import + one stat line + removed now-unused `computeBaseStatsForGenerated` from the deps destructure; 7 real-handler tests |
| 3. Level-up keeps the bonus (D1) | bacc6d17 | index.ts `apply_level_up` and commands.ts `level_character`; 7 real-handler tests |

## Test results

- `race_bonuses.test.ts` 15, `creation_finalize.test.ts` 7, `level_up_race_bonus.test.ts` 7, `llm_cutover.test.ts` stays green (141 across those four files).
- `src/gameDataAlias.test.ts` 6 passed; `pnpm exec vue-tsc -b` exit 0.
- Full `spacetimedb` suite: 3839 passed, 2 failed, both in the baseline file `measurement.results.test.ts` (ignored per instructions).
- No schema, table, reducer or view change (`git diff --stat spacetimedb/src/schema` empty; `intent.ts` untouched).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Cleanup] Removed now-unused imports/destructure names**
- `detectPrimarySecondary` import removed from `index.ts` (its only use was the replaced line); in `commands.ts` the import was swapped for `levelUpBaseStats` and the unused `computeBaseStatsForGenerated` deps name was removed. `index.ts` still imports and passes `computeBaseStatsForGenerated` in deps (left alone, plan said to leave the deps object).
- Files: index.ts, commands.ts, creation.ts. Commits: 18464629, bacc6d17.

**2. TDD ordering (process note)**
- Task 2 followed RED then GREEN (4 of 7 tests failed before the edit, including the F1 crash). In Task 1 the helper and its tests were written together, and in Task 3 the production edit preceded the first test run, so no separate RED run was recorded for those two.

Otherwise the plan executed as written. Planned line numbers held (creation.ts line 192, index.ts ~495, commands.ts ~607).

## Known Stubs

None.

## Threat Flags

None. No new endpoint, auth path or schema change; `requireAdmin` and `requireCharacterOwnedBy` are untouched and a non-admin test pins `Admin only`.

## Notes for later plans

- Max HP: a +STR race bonus raises starting max HP by 8 per point (balance note for the owner, as in research).
- Characters created before this phase never got the bonus, so their first level-up can come out slightly off (D1, accepted; owner checklist item in Plan 10, T-49-03).
- Mock quirk used in the tests: `race_definition.by_name` maps to column `name`, so test rows carry `name` and `nameLower` both lowercase.
- No publish was done; Plan 49-02 publishes.

## Self-Check: PASSED

- Files exist: race_bonuses.ts, race_bonuses.test.ts, creation_finalize.test.ts, level_up_race_bonus.test.ts.
- Commits exist: 383a3e87, 18464629, bacc6d17.
