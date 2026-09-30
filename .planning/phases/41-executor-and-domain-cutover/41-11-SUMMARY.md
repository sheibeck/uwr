---
phase: 41-executor-and-domain-cutover
plan: 11
subsystem: llm-cutover-combat-narration
tags: [spacetimedb, llm, combat, narration, enqueue, cutover, local-publish, tests]
status: complete
requires:
  - phase: 41-05 (enqueueLlmJob, SOURCE_KEYS.combatNarration, cap-exempt combat_narration)
  - phase: 41-06 (executor narration rules: cap - 1, one attempt, 20 s expiry at claim and at persist)
  - phase: 41-10 (llm_cutover.test.ts harness)
provides:
  - "buildCombatOutroSummary(ctx, combat, participants, enemies, narrativeType) and enqueueCombatOutroNarration(...) (never throws) in helpers/combat_narration.ts"
  - "One outro call in handleVictory and one in handleDefeat, before clearCombatArtifacts"
  - "helpers/combat_narration.test.ts (14 tests) and a combat outro block in reducers/llm_cutover.test.ts (5 tests)"
  - "LEGACY_MODEL_LITERALS without the combat_narration.ts entry"
affects: [41-12, 41-13, 41-14, 41-15, 41-16]
tech-stack:
  added: []
  patterns:
    - "Failure-proof enqueue: whole body in try/catch, redacted console.error, refusal ignored, no fail() message"
    - "Snapshot the outro summary into requestJson at enqueue so the executor reads no combat state later"
key-files:
  created:
    - spacetimedb/src/helpers/combat_narration.test.ts
  modified:
    - spacetimedb/src/helpers/combat_narration.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/reducers/llm_cutover.test.ts
    - spacetimedb/src/data/model_literals.test.ts
key-decisions:
  - "Near death = alive participant at or below 10 percent HP, computed in bigint (hp * 100 <= maxHp * 10)"
  - "Deaths list participants first, then enemies at 0 HP; participantHpSummary lists participants then enemies"
  - "Call placed after applyDeathPenalties in handleVictory (immediately before clearCombatArtifacts) so character HP is final; in handleDefeat immediately before clearCombatArtifacts"
  - "MAX_COMBAT_NARRATIONS and NARRATION_BUDGET_THRESHOLD remain in data/combat_constants.ts (not part of this plan); they are now unreferenced by combat_narration.ts"
metrics:
  tasks: 2
  files: 5
  tests_added: 19
  suite: "1944 passed (spacetimedb, baseline 1925 + 19)"
completed: 2026-09-30
---

# Phase 41 Plan 11: Combat Outro Narration Summary

Combat narration now runs on the executor as a victory or defeat outro, queued from `handleVictory` and `handleDefeat` before the combat artifacts are cleared, skipped silently on refusal, dropped when late, and incapable of affecting combat resolution.

## What was built

### Task 1: outro summary and never-throwing enqueue (commit c9c05b30)
- `combat_narration.ts`: deleted `shouldNarrateRound`, `triggerCombatNarration` and their imports (legacy budget helpers, legacy prompt builders, narration cap constants, the legacy `llm_task` insert and the model literal). Kept `RoundEventSummary` (data/llm_layers.ts type import), `handleCombatNarrationResult` (llm_apply.ts) and `sendNarrationSkippedMessage` untouched.
- `buildCombatOutroSummary`: `roundNumber 0n`, empty action and effect lists, `deaths` (participants at 0 HP read fresh, then enemies at 0 HP), `nearDeathNames`, derived `hasKill` and `hasNearDeath`, `participantHpSummary` (bigint hp and maxHp, participants then enemies), `locationName`, `enemyNames`, `playerNames`.
- `enqueueCombatOutroNarration`: whole body in try/catch (`console.error('combat narration skipped: ' + redactSecrets(...))`); leader is `combat.leaderCharacterId` else the first participant; player via `resolveCharacterPlayerId` (returns when none); `enqueueLlmJob` with `SOURCE_KEYS.combatNarration(combat.id, 0, type)` and request `{ combatId, roundNumber: '0', narrativeType, participantCharacterIds, input: encodeRouteInput(summary) }`; a refusal is ignored.
- `combat_narration.test.ts` (14 tests): one job plus one dispatch charged to the leader's player with the keys `handleCombatNarrationResult` reads; decoded input with bigint HP that builds its layers; defeat deaths; no-leader fallback to the first participant's owner; dedupe (two calls, one job); cap-exempt with three active capped jobs; silent refusal at the daily cost limit (no job, dispatch, sweep tick, private event, reservation or log); no resolvable player and no participants write nothing; a throwing job insert and a throwing lookup are caught with a redacted log line and unchanged combat rows; static checks (no round trigger, no `llm_task`, no budget helper, no model literal, kept exports).

### Task 2: hook, allowlist, publish, build (commit 45433310)
- `combat.ts`: import plus exactly one call in each handler, immediately before `clearCombatArtifacts(ctx, combat.id)`. Nothing else in combat.ts changed; the third `clearCombatArtifacts` site (non-victory, non-defeat resolution) has no call.
- `llm_cutover.test.ts` (5 new tests): static order tests on the handler texts (victory call once and before its clear, defeat call once and before its clear, exactly two calls in the file, the other clear site has none); end-to-end with `createMockProcCtx` and `runLlmJob` (deps `nowMs` tied to the mock clock, scripted `ok_text` fixture): a reply persisted 2 s after enqueue completes and appends a `combat_narration` private event for both participants plus one `combat_narrative` row; a reply at 21 s leaves the job `expired` with errorCode `late` and no event or narrative row.
- Deleted the `combat_narration.ts` entry from `LEGACY_MODEL_LITERALS`.

## Local publish

Code-only change; the local server was already running (ping 200). `pnpm spacetime:publish < /dev/null` needed no clear and no `--break-clients`:

```
Checking for breaking changes...
Publishing module...
Updated database with name: uwr, identity: c200f2029b92b15e2164adf6951b34cc614ea4063d36996c58cac1799244c14a
```

`spacetime logs uwr --server local` ends with `Updated program to 8b3c518a...` and `Database updated`, no errors. `pnpm spacetime:generate` produced no diff against the committed bindings, so there is no bindings commit. `spacetime build -p spacetimedb` prints "Build finished successfully" (the "tsc not found" line it also prints is the existing tool warning and did not fail either build or publish). `pnpm build` exits 0. Nothing targeted maincloud.

## Verification

- Full suite `CI=true pnpm --dir spacetimedb exec vitest run --maxWorkers=1`: 48 files, 1944 tests passed (baseline 1925, plus 14 in combat_narration.test.ts and 5 in llm_cutover.test.ts).
- Acceptance greps: `llm_task` in combat_narration.ts 0; `checkBudget|incrementBudget|gpt-` 0; `enqueueCombatOutroNarration(ctx, combat` in combat.ts 2; `helpers/combat_narration.ts` in model_literals.test.ts 0.

## Deviations from Plan

None - plan executed as written. TDD note: the plan's two tasks were committed as one implementation-plus-tests commit each (helper and its tests together; hook and its tests together) rather than separate RED and GREEN commits; the plan did not call for per-step TDD commits.

## Notes for later plans

- Live narration (a real reply appended to the combat log) needs the real key from 41-16; here it is proven with scripted replies only.
- `sendNarrationSkippedMessage` is left in place, untouched, as instructed; it has no caller in the new flow (refusal is silent).

## Known Stubs

None.

## Threat Flags

None. T-41-23 mitigated (try/catch, validate-before-write in `enqueueLlmJob`, failure-isolation tests); T-41-04 mitigated (one outro per combat via dedupe key, silent budget refusal, executor one attempt, below cap - 1, dropped when late; proven end to end); T-41-03 mitigated (leader's owner via `resolveCharacterPlayerId`, result broadcast only to participant ids stored in the job); T-41-14 respected (local publish only).

## Self-Check: PASSED
- FOUND: spacetimedb/src/helpers/combat_narration.ts, spacetimedb/src/helpers/combat_narration.test.ts, spacetimedb/src/reducers/combat.ts, spacetimedb/src/reducers/llm_cutover.test.ts, spacetimedb/src/data/model_literals.test.ts
- FOUND commits: c9c05b30, 45433310
