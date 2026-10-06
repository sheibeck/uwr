---
phase: 49-character-creation-interview
plan: 04
subsystem: client
tags: [vue, creation, pure, race-cards, character-sheet]

requires:
  - phase: 49-01
    provides: "@game-data/race_bonuses (parseRaceBonuses, computeCreationStats)"
provides:
  - "src/creation/raceCards.ts: newest-3 race cards with stat tags and descriptions"
  - "src/creation/abilityCards.ts: ability cards and chosenAbilityName"
  - "src/creation/sheetModel.ts: buildSheet, the live sheet as a pure function of the creation row"
affects: [49-07, 49-08, 49-09]

tech-stack:
  added: []
  patterns:
    - "Structural *Like interfaces instead of binding imports so models stay pure"
    - "Client reaches server math only through the @game-data alias, never a relative path"

key-files:
  created:
    - src/creation/raceCards.ts
    - src/creation/raceCards.test.ts
    - src/creation/abilityCards.ts
    - src/creation/abilityCards.test.ts
    - src/creation/sheetModel.ts
    - src/creation/sheetModel.test.ts
  modified: []

key-decisions:
  - "Description cut: the body is at most 160 characters at a word boundary and the ellipsis is appended after it; a flavor is never cut (CSS clamps it)"
  - "First sentence ends at . ! or ? followed by whitespace or the end, so 2.5 is not a sentence end; whitespace runs collapse to single spaces"
  - "A classStats value that is valid JSON but not an object (number, string, array, null) is treated as unparseable and leaves the class source out"
  - "chosenAbilityName gives null (not the server's 'Unknown') when no name is available, so the sheet hides the row"

requirements-completed: [CRE-02, CRE-03]

coverage:
  - id: R1
    description: "Race suggestions are the newest 3 stored races; fewer shows only those; none gives the no-races line; unapplied gives null"
    requirement: CRE-03
    verification:
      - kind: unit
        ref: "src/creation/raceCards.test.ts#selectRaceCards"
        status: pass
    human_judgment: false
  - id: R2
    description: "Ability cards come from the stored abilities JSON (up to 3); unparseable JSON gives none"
    requirement: CRE-01
    verification:
      - kind: unit
        ref: "src/creation/abilityCards.test.ts#parseAbilityCards"
        status: pass
    human_judgment: false
  - id: R3
    description: "Sheet stats equal computeCreationStats for the same state (finalize's function); the name fills last"
    requirement: CRE-02
    verification:
      - kind: unit
        ref: "src/creation/sheetModel.test.ts#buildSheet: parity with finalize (computeCreationStats)"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-10-06
status: complete
---

# Phase 49 Plan 04: Race Cards, Ability Cards and Live Sheet Models Summary

**Three pure models for the creation view: race cards from the newest 3 stored races with stat tags, ability cards from the stored abilities JSON, and a live sheet whose stat values come from the server's own computeCreationStats.**

## Exports (Plans 07, 08 and 09 render these)

`src/creation/raceCards.ts`

```ts
export interface RaceDefinitionLike { id: bigint; name: string; narrative: string; bonusesJson: string; createdAt: { microsSinceUnixEpoch: bigint } }
export interface RaceCard { id: bigint; name: string; description: string; tags: string[]; ariaLabel: string; sends: string }
export const NO_RACES_LINE: string
export function selectRaceCards(rows: readonly RaceDefinitionLike[], applied: boolean): RaceCard[] | null   // null = not applied, render nothing
export function raceCardTags(bonusesJson: string): string[]
export function raceCardDescription(bonusesJson: string, narrative: string): string
```

`src/creation/abilityCards.ts`

```ts
export interface AbilityCard { key: string; name: string; description: string; kind: string; tags: string[]; ariaLabel: string; sends: string }
export function parseAbilityCards(json: string | null | undefined): AbilityCard[]
export function chosenAbilityName(json: string | null | undefined, index: bigint | null | undefined): string | null
```

`kind` is the raw kind string; the component resolves the icon with `abilityIcon(kind)` from `src/hotbar/hotbar.ts`.

`src/creation/sheetModel.ts`

```ts
export interface CreationStateLike { raceName?; raceNarrative?; raceBonuses?; archetype?; className?; classStats?; abilities?: string | null; chosenAbilityIndex?: bigint | null; characterName? }
export interface SheetStat { key: StatKey; label: string; value: string; raceBonus: number; boosted: boolean; annotation: string | null; ariaLabel: string }
export interface SheetModel { name; avatarInitial; raceName; archetype: 'Warrior' | 'Mystic' | null; className; stats: SheetStat[]; trait; abilityName }
export function buildSheet(state: CreationStateLike | null): SheetModel
```

The `CharacterCreationState` binding row is assignable to `CreationStateLike`. A null name, race, class, trait or ability means "show the placeholder" (`Unnamed`, `Unwritten`, hidden trait, hidden ability row); an unwritten stat has value `—` and aria label `{Label} unwritten`.

## Tasks and commits

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1. Race cards | a280b9c3 | 28 tests |
| 2. Ability cards and chosenAbilityName | 8c5a692d | 19 tests |
| 3. Sheet model | 05b4c667 | 28 tests incl. 4 parity fixtures and the source pin |

## Test results

- `pnpm exec vitest run src/creation --maxWorkers=2`: 6 files, 180 tests passed.
- `src/gameDataAlias.test.ts` passed with the sheet model test (34 tests across the two files).
- `pnpm exec vitest run --dir src --maxWorkers=2`: 105 files, 2172 tests passed.
- `pnpm exec vue-tsc -b`: exit 0.

## Deviations from Plan

**1. Commit attribution trailer**
- Commits carry `Co-Authored-By: Claude Sonnet 5.5` (the model that ran), per the harness attribution instruction, not the Opus line in the run prompt. Session line as requested.

**2. TDD ordering (process note)**
- Tests were written before each implementation, but the RED run was only recorded for 49-03 Task 1; each task is one commit (tests plus implementation), following the 49-01 convention.

Otherwise the plan executed as written. No server file was touched.

## Known Stubs

None.

## Threat Flags

None. All strings stay plain; tests keep `<img src=x onerror=alert(1)>` and `<b>x</b>` verbatim in race, class, ability and character names, flavor and descriptions (T-49-13). Every JSON parse is in try/catch (T-49-16).

## Self-Check: PASSED

- Files exist: raceCards.ts, raceCards.test.ts, abilityCards.ts, abilityCards.test.ts, sheetModel.ts, sheetModel.test.ts.
- Commits exist: a280b9c3, 8c5a692d, 05b4c667.
