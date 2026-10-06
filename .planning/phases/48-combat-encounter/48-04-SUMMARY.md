---
phase: 48-combat-encounter
plan: 04
subsystem: client-data-hub
tags: [vue-client, subscriptions, spacetimedb-client, combat]
status: complete
requires: ["48-01", "48-03"]
provides:
  - "Scoped combat subscription SQL in src/game/queries.ts (character_id, combat_id, id and enemy_template_id filters; static my_combat_aggro)"
  - "GameData.combat (CombatData contract) with inert defaults via createInertCombatData"
  - "GameReducers.submitCombatAction, fleeCombat, setCombatTarget in object syntax"
  - "Combat bindings in createGameData that follow the own participant row, with a 30 s narrative linger"
affects: [48]
tech-stack:
  added: []
  patterns: ["keyed bindings driven by a derived key (combat id of the own participant row)", "linger-key ref with one timer cleared on new fight, reset and scope stop"]
key-files:
  created: []
  modified:
    - src/game/queries.ts
    - src/game/queries.test.ts
    - src/game/context.ts
    - src/game/gameData.ts
    - src/game/gameData.test.ts
key-decisions:
  - "combat.active means the own combat_participant row exists; game.inCombat keeps its Phase 47 meaning (combatTargetEnemyId), its test untouched"
  - "combat.applied is combatKey != null AND the enemy binding's applied flag; with the default onApplied swap a direct fight-to-fight switch keeps the old enemy binding (and its applied flag) until the new one applies"
  - "combat.aggro mirrors the static my_combat_aggro rows unfiltered (the view is already scoped server-side); consumers pick the fight by combatId"
  - "The party id list gains the fight participants, so it narrows or widens through the normal keyed swap (old list stays until the new one applies)"
requirements-completed: [CMB-01, CMB-02, CMB-03, CMB-04, CMB-06]
metrics:
  tasks: 3
  files: 5
  completed: 2026-10-06
---

# Phase 48 Plan 04: Combat data in the client hub Summary

`game.combat` now exposes the player's own fight (participants, hostiles, enemy templates and abilities, rounds with the open round and number, own choice for the open round, casts, narratives, pets, threat rows, name maps) through filtered subscriptions that appear and disappear with the own participant row. The three combat reducers are typed on `GameReducers`. No component changes.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Scoped combat queries | e2dc5ccb | src/game/queries.ts, src/game/queries.test.ts |
| 2 | CombatData contract, combat reducers, inert defaults | cb936aa6 | src/game/context.ts, src/game/gameData.test.ts |
| 3 | Combat bindings and derived state | 54c02077 | src/game/gameData.ts, src/game/gameData.test.ts |

## What was built

- **queries.ts**: `myCombatAggro` (static, no WHERE), `combatParticipantsOf` and `combatActions` by `character_id`, `combatParticipants`, `combatEnemies`, `combatRounds`, `combatCasts`, `combatNarratives`, `combatPets` by `combat_id`, `enemyTemplatesById` and `enemyAbilitiesByTemplate` as OR chains (throw on an empty list).
- **context.ts**: `CombatData`, `createInertCombatData()`, `GameData.combat`, and `submitCombatAction`, `fleeCombat`, `setCombatTarget`. `createInertGame()` uses the inert block, so every shell test that spreads it keeps mounting.
- **gameData.ts**: ten new `GameConn.db` accessors; static `myCombatAggro` binding; `ownParticipant` and `ownActions` keyed by character; `combatKey` (combat id of the first own participant row); fight bindings keyed by `combatKey`, each with a filter equal to its query; `narrativeKey` that lingers `NARRATIVE_LINGER_MS = 30_000` after the fight (one timer, cleared on a new fight, `reset()`/`dispose()` and scope stop); enemy template and ability id-list bindings from the enemies' template ids; the party key also takes fight participants (never the player). Derived: `openRound` (highest `action_select` round), `roundNumber` (open, else highest seen, else null), `ownAction` (matching combat and round only), `characterNames`, `petNames`.

## Pinned assertions changed deliberately

All in `src/game/gameData.test.ts` (Phase 47 file):

1. The hand-written `queries` literal gained the combat members (typing only).
2. `STATIC_SQL` gained `'Q_COMBAT_AGGRO'` (9 entries).
3. `expect(STATIC_SQL).toHaveLength(8)` became `toHaveLength(9)`.
4. The test title "attaches the 7 static bindings and event_world ..." became "attaches the 8 static bindings and event_world ...".

Nothing else in a Phase 45/47 test changed. The existing "is true only when combatTargetEnemyId is set" case is untouched.

## Verification

- `pnpm exec vitest run src/game`: 6 files, 99 tests passed (queries 19, gameData 31 before plus the new combat and inert cases).
- `pnpm exec vue-tsc -b`: exit 0.
- `pnpm exec vitest run --dir src --maxWorkers=2`: 89 files, 1554 tests passed (baseline before this plan was 1372 tests in 78 files at 48-01; later plans added the rest).

## Deviations from Plan

None. The plan executed as written. (Test note: in the party-list test the narrower list `Q_CHARS_BY_ID_8` stays live until `Q_CHARS_BY_ID_8,9` applies, which is the existing keyed swap contract, so the test applies the wider binding before asserting.)

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-48-13 and T-48-14: every combat query has a WHERE (queries test) and every keyed binding filter rejects rows of another combat or character (gameData test). T-48-15: one linger timer, cleared on new fight, reset, dispose and scope stop, proven by timer-count and live-binding tests. T-48-16 accepted (typed wrappers only).

## Flagged assumptions

- CMB-01/02/03 edge probe (unclassified): fight start before the fight bindings apply (`applied` false until the enemy binding applies), fight end while bindings are pending (key null disposes pending and current at once), two fights in a row (narratives rebind, old timer cleared) are covered by tests. A reconnect re-attaches via the existing keyed `conn` watcher; not separately tested here. Left for the verifier.
- RESEARCH A1: a 30 s narrative linger covers the 20 s executor maximum age; a later narration only loses its round tag.
- A direct fight A to fight B switch (no gap with a null key) keeps fight A rows and the old `applied` flag until fight B's enemy binding applies (keyed `onApplied` swap). Expected to be rare; the server removes the participant row between fights.

## Deferred owner verification

No hands-on check is needed for this plan (data layer only, covered by unit tests). When the owner tries the Phase 48 client later: start a fight and confirm the encounter appears, end it and confirm the closing narration still lands on its round within about 30 s, and reload mid-fight to confirm the encounter comes back.

## Self-Check: PASSED

- FOUND: src/game/queries.ts, src/game/queries.test.ts, src/game/context.ts, src/game/gameData.ts, src/game/gameData.test.ts
- FOUND commits: e2dc5ccb, cb936aa6, 54c02077
