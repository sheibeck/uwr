---
phase: 40-claude-request-layer-and-job-seam
plan: 05
subsystem: testing
tags: [vitest, characterization-tests, snapshot, spacetimedb, submit_llm_result, validators]
requires:
  - phase: 40-01
    provides: schema_recorder (createRecordingServerMock, capturedReducer, snapshotDb, rowColumnProblems) and test-utils
provides:
  - Characterization tests and committed full-database snapshots for the unchanged submit_llm_result reducer (all 7 domains, wrapper guards, failure paths, quirks)
  - Retention tests proving the v2.0 validators still clamp and reject model output (skill_gen and world_gen)
affects: [40-08, 41]
tech-stack:
  added: []
  patterns:
    - "exec() harness: call the captured reducer, assert every inserted row against recorded table columns, then toMatchSnapshot of the whole mock DB"
    - "Deterministic snapshots: fixed timestamp, Math.random stubbed to 0.42, one shared identity object for seed and sender"
key-files:
  created:
    - spacetimedb/src/helpers/submit_llm_result.characterization.test.ts
    - spacetimedb/src/helpers/__snapshots__/submit_llm_result.characterization.test.ts.snap
  modified:
    - spacetimedb/src/helpers/skill_gen.test.ts
    - spacetimedb/src/helpers/world_gen.test.ts
key-decisions:
  - "Pin what the code does, quirks included; no production file touched"
  - "Every characterization case also runs rowColumnProblems over the rows the reducer inserted, so a PIPE-08 style non-column insert would fail the test (none found in the apply code)"
  - "Cases that throw (missing genStateId, rank-2 renown fallback) assert the throw only, not a snapshot, because the mock DB does not roll back like a real transaction"
patterns-established:
  - "Plan 40-08 must run submit_llm_result.characterization.test.ts unmodified and green; snapshot entries are the contract"
requirements-completed: []
duration: 55min
completed: 2026-09-29
status: complete
---

# Phase 40 Plan 05: Characterization of submit_llm_result Summary

The current `submit_llm_result` reducer (index.ts 943-1636) is pinned by 120 cases and 116 full-database snapshots run against the real handler captured through the schema recorder, plus 21 retention cases proving the v2.0 validators still clamp or reject model output. No production code changed.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wrapper, creation and skill_gen branches | 9be20a08 | helpers/submit_llm_result.characterization.test.ts, helpers/__snapshots__/...snap |
| 2 | world_gen, npc_conversation, combat_narration, renown branches | d31e4df5 | same two files |
| 3 | v2.0 validator retention on model output | 8a5cf4e9 | helpers/skill_gen.test.ts, helpers/world_gen.test.ts |
| extra | Creation reply validator gap pinned for Phase 41 | 5f997035 | characterization test and snapshot |

## What is pinned

- Wrapper: unknown task, another player's task, non-pending task (completed and errored) each throw the exact SenderError; guard order is existence, ownership, status; status becomes `completed` or `error`; an unknown domain touches nothing else.
- Failure paths: creation_race to AWAITING_RACE, creation_class to AWAITING_ARCHETYPE, world_gen through `retryWorldGen` (private event when the character has a location, creation_error when not), skill_gen and npc_conversation in-voice messages (including the 60-second dialog dedupe), combat_narration and renown_perk_gen change only the task status.
- creation success: budget incremented before parsing, malformed reply reverts the step (state fields and all, including a null ability that throws midway), existing race definition is not duplicated, fenced and prose-wrapped JSON accepted.
- world_gen success: starter and non-starter regions, danger raise, enemy level clamp, uncharted edge turned into a passage, character placement (safe home, non-safe fallback), arrival and discovery messages, world event, budget charged to the state's player; non-GENERATING state returns silently; bad JSON, missing regionName, empty or missing locations all retry.
- skill_gen success: three pending rows, presentation, budget, validators on the way in, replacement of stale pending rows, fewer than three (grimace, no budget), only the first three considered.
- npc_conversation success: dialogue and effects, memory and cooldown updates, affinity clamped to plus or minus 5 with the four cue tiers, quest creation for kill, kill_loot, boss_kill, delivery, explore and gather, both quest caps and duplicate-name skip, invalid JSON writes the mutter messages without a budget increment.
- combat_narration: JSON, fenced JSON, raw prose, JSON without a narrative field, empty reply, victory (no round prefix), no participants.
- renown_perk_gen: three valid perks, first-three limit, rank default, static fallback (rank 4 and rank 6), rank without a pool, missing character.
- Validator retention (skill_gen.test.ts, ceilings derived from `BASE_BUDGET`): over-budget value1 and effectMagnitude, under-budget floor, unknown kind, unknown targetRule, resourceType, scaling, damageType and effectType, mana cast floor, 9-second duration floor for dot, hot, buff and debuff, the Claude structured-output shape with explicit nulls equal to omitted fields, fewer than three skills. world_gen.test.ts: enemy levels 99 and negative clamped into the band, stats derived from the clamped level, starter extremes at level 1, danger cap at 800.

## Deviations from Plan

None on scope. Two harness notes:

- The plan asked for "at least 28 `it(` cases"; the file has 120 (including `it.each` expansions) and 116 snapshot entries.
- Snapshot entries for Task 1 were verified byte-identical (after newline normalization) when Task 2 rewrote the file: 33 old entries, 0 changed, 0 missing. Vitest sorts entries alphabetically, so a raw `git diff` of the `.snap` shows interleaving and is not a valid check.

## Where behavior differs from RESEARCH section 1

1. **Rank-2 renown static fallback throws.** RESEARCH says fewer than three valid perks falls back to `RENOWN_PERK_POOLS`. For rank 2 (and rank 3, 5, 9, 11 and others whose first three perks carry a bigint effect) `JSON.stringify(perk.effect)` throws `TypeError: Do not know how to serialize a BigInt`, so in production the whole call rolls back and the task stays `pending`. Ranks whose first three perks have no bigint effect (for example 4 and 6) work. Pinned as a throw. This is a live bug for Phase 41 / the renown work; not fixed here.
2. **`by_name` mock mapping.** The mock DB maps `by_name` to the column `name`, but the real `race_definition.by_name` index is on `nameLower`. The "definition already exists" branch is exercised with a row whose `name` is lowercase. Behavior of the real index is not proven by these tests.
3. **Missing raceName / className print "**undefined**"** in the creation event text while storing "Unknown" / "Unknown Class".
4. **A negative affinity change that crosses a tier logs "Your relationship with X improved to Wary."** (the message says "improved" for a decline).
5. **A context without `genStateId`** (world_gen, both failure and success) throws a BigInt TypeError, i.e. a whole-call rollback in production.
6. **world_gen success charges the budget to `genState.playerId`**, not the sender.
7. **renown_perk_gen with a rank that has no static pool** and fewer than three valid perks inserts nothing and writes no message, but still increments the budget.
8. **creation_class exception midway** (for example a null ability) reverts the state update completely because the revert spreads the pre-update row.

## Phase 41: validator gap

- Creation race replies are stored and shown with no clamping: bonus values (for example 99 or -5) and unknown stat names pass through, and the same values are saved into `race_definition.bonusesJson` for reuse by other players.
- Creation class replies are stored with no clamping: ability `value1` (for example 99999), unknown `kind`, and `stats.bonusHp` (for example 9999) pass through into `character_creation_state.abilities` and `classStats`.
- Both are pinned by tests named "Phase 41: validator gap" in the characterization file. No clamping was added.
- All other expected clamps (skill_gen values and enums, mana cast floor, duration floor, enemy levels) exist; no other gap was found.

## Verification

- `pnpm --dir spacetimedb exec vitest run src/helpers/submit_llm_result.characterization.test.ts` passes twice in a row with no snapshot written on the second run
- `pnpm --dir spacetimedb exec vitest run src/helpers/skill_gen.test.ts src/helpers/world_gen.test.ts`: 45 passed
- `pnpm --dir spacetimedb test`: 28 files, 1112 passed (971 before this plan)
- `git status --porcelain spacetimedb/src` shows only the four planned test and snapshot files (no production change)

## Known Stubs

None.

## Threat Flags

None. T-40-10 mitigated (characterization tests and committed snapshots; Plan 40-08 must pass them unmodified). T-40-17 mitigated for skill_gen and world_gen; creation gap recorded for Phase 41.

## Self-Check: PASSED

- FOUND: spacetimedb/src/helpers/submit_llm_result.characterization.test.ts, spacetimedb/src/helpers/__snapshots__/submit_llm_result.characterization.test.ts.snap, skill_gen.test.ts, world_gen.test.ts
- FOUND commits: 9be20a08, d31e4df5, 8a5cf4e9, 5f997035
