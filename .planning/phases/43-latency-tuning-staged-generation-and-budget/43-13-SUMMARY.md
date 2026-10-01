---
phase: 43-latency-tuning-staged-generation-and-budget
plan: 13
subsystem: api
tags: [spacetimedb, llm, character-creation, staged-generation, sweeper, vitest]
status: complete

requires:
  - phase: 43-latency-tuning-staged-generation-and-budget
    provides: CLASS_REVEAL_SCHEMA, CLASS_FILL_SCHEMA, CreationClassInput and CreationClassFillInput, creation_class_reveal and creation_class routes (43-04); resting copy in applyLlmFailure (43-03); client lock lists that never lock CLASS_FILLING or CLASS_FILL_ERROR (43-09); per-stage sweeper holder sets pattern (43-11)
provides:
  - startCreationGeneration enqueues creation_class_reveal for the class
  - buildClassFillInput, startClassFill, retryClassFill and the four class stage lines
  - applyClassRevealResult, applyClassFillResult, failClassFill and a stage-aware creationStateForJob
  - CLASS_FILLING and CLASS_FILL_ERROR steps in submit_creation_input and start_creation, with go-back rules
  - sweeper locks for both class stages
affects: [43-14, 43-15]

tech-stack:
  added: []
  patterns:
    - "Stage 1 apply enqueues stage 2 in the same transaction (mirrors applyWorldStartResult / startWorldFill)"
    - "A stage-2 failure keeps stage 1 on the state and degrades to a playable error step; only player input re-enqueues"
    - "Sweeper lock table maps each creation step to its holder route, the step to return to and the line to post"

key-files:
  created: []
  modified:
    - spacetimedb/src/helpers/creation_generation.ts
    - spacetimedb/src/helpers/creation_generation.test.ts
    - spacetimedb/src/helpers/llm_apply.ts
    - spacetimedb/src/helpers/llm_apply.test.ts
    - spacetimedb/src/helpers/llm_apply.characterization.test.ts
    - spacetimedb/src/helpers/__snapshots__/llm_apply.characterization.test.ts.snap
    - spacetimedb/src/reducers/creation.ts
    - spacetimedb/src/helpers/llm_sweeper.ts
    - spacetimedb/src/helpers/llm_sweeper.test.ts
    - spacetimedb/src/reducers/llm_cutover.test.ts

key-decisions:
  - "A fill reply that adds no usable ability (fewer than two abilities after the merge) is treated as malformed and fails the fill, so a class can never reach CLASS_REVEALED with only the stage-1 ability"
  - "applyCreationResult now handles creation_race only; the class has its own two apply functions (no wrapper, greenfield)"
  - "At CLASS_FILL_ERROR the phrase 'try again' is a retry, not a go-back (the Keeper's own line says he will try again); every other go-back phrase still asks to go back"
  - "A duplicate fill (job already active while the step says CLASS_FILL_ERROR) answers with the patience line"

patterns-established:
  - "Sweeper source guard: llm_sweeper.ts has no startClassFill, retryClassFill or enqueueLlmJob call"

requirements-completed: []  # LAT-04 and LAT-05 server half only; standing rule: no requirements mark-complete

coverage:
  - id: D1
    description: "Choosing an archetype enqueues exactly one creation_class_reveal job (dedupe key by route and state); a refused enqueue reverts to AWAITING_ARCHETYPE with the refusal or resting line"
    requirement: LAT-04
    verification:
      - kind: unit
        ref: "spacetimedb/src/helpers/creation_generation.test.ts#startCreationGeneration: class"
        status: pass
      - kind: unit
        ref: "spacetimedb/src/reducers/llm_cutover.test.ts#at AWAITING_ARCHETYPE moves to GENERATING_CLASS and enqueues one creation_class_reveal job"
        status: pass
    human_judgment: false
  - id: D2
    description: "The reveal stores the class name, description and exactly one clamped ability, posts the class identity with 'Your first ability:' (no square brackets) and the milestone line, and enqueues the creation_class fill in the same apply (CLASS_FILLING, or CLASS_FILL_ERROR when refused); an unusable reveal reverts to AWAITING_ARCHETYPE and enqueues nothing"
    requirement: LAT-04
    verification:
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_apply.test.ts#Phase 43 (plan 13): staged class apply"
        status: pass
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_apply.characterization.test.ts#llm apply creation_class_reveal success (stage 1)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The fill merges stats and abilities with the stored first ability through validateClassReply (at most three abilities, stage-1 ability first) and only then moves to CLASS_REVEALED; a malformed or ability-less fill sets CLASS_FILL_ERROR and keeps the reveal"
    requirement: LAT-04
    verification:
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_apply.characterization.test.ts#llm apply creation_class success (stage 2, the fill)"
        status: pass
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_apply.characterization.test.ts#llm apply creation replies: Phase 41 clamped"
        status: pass
    human_judgment: false
  - id: D4
    description: "Input during CLASS_FILLING gets the patience line and changes nothing (go-back not offered); input at CLASS_FILL_ERROR retries the fill only (one creation_class job, no reveal job, retry line); the resting or refusal line answers a retry while the kill switch or a limit holds; go-back from CLASS_FILL_ERROR still works and clears the class"
    requirement: LAT-04
    verification:
      - kind: unit
        ref: "spacetimedb/src/reducers/llm_cutover.test.ts#staged class reveal (LAT-04) > the reducer at the two new steps"
        status: pass
    human_judgment: false
  - id: D5
    description: "End to end through the captured reducers and runLlmJob: archetype, reveal visible with a fill job pending, input cannot reach AWAITING_NAME while filling, fill, CLASS_REVEALED with three abilities, choosing an ability reaches AWAITING_NAME; a failed or malformed fill keeps the reveal and one input retries the fill only"
    requirement: LAT-04
    verification:
      - kind: unit
        ref: "spacetimedb/src/reducers/llm_cutover.test.ts#staged class reveal (LAT-04) > end to end through the reducers and the executor"
        status: pass
    human_judgment: false
  - id: D6
    description: "A stranded GENERATING_CLASS lock (no creation_class_reveal job) returns to AWAITING_ARCHETYPE and a stranded CLASS_FILLING lock (no creation_class job) becomes CLASS_FILL_ERROR with the failed line and its stage-1 class kept; the matching route holds the lock, the other does not; the sweeper never retries"
    requirement: LAT-04
    verification:
      - kind: unit
        ref: "spacetimedb/src/helpers/llm_sweeper.test.ts#the staged class locks"
        status: pass
    human_judgment: false
  - id: D7
    description: "The four new lines never call the Keeper it or they and never say 'your name'; they pass the repository pronoun guard"
    requirement: LAT-05
    verification:
      - kind: unit
        ref: "spacetimedb/src/helpers/creation_generation.test.ts#class stage lines"
        status: pass
      - kind: unit
        ref: "spacetimedb/src/data/pronoun_rules.test.ts#repository pronoun guard"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-10-01
---

# Phase 43 Plan 13: Staged class reveal Summary

**Choosing an archetype now enqueues a small creation_class_reveal job whose apply shows the class name, description and first ability with a milestone line and queues the creation_class fill in the same transaction; the class only reaches CLASS_REVEALED after the fill merges stats and two more abilities through validateClassReply, and a failed fill keeps the reveal and is retried by one input.**

## Accomplishments

- `creation_generation.ts`: the class branch of `startCreationGeneration` routes `creation_class_reveal`; new `buildClassFillInput` (reads the first ability from the stored abilities JSON, throws a plain Error without one), `startClassFill` (enqueue under the same source key, `CLASS_FILLING`; refusal or missing ability sets `CLASS_FILL_ERROR` and posts one `creation_error`), `retryClassFill` (calls `startClassFill`, posts the retry line only when a job was enqueued, never enqueues a reveal), and the four lines. Header comment documents the class stage machine.
- `llm_apply.ts`: `creationStateForJob` is stage-aware (`creation_race` to GENERATING_RACE, `creation_class_reveal` to GENERATING_CLASS, `creation_class` to CLASS_FILLING, anything else null). `applyCreationResult` is race only. New `applyClassRevealResult`, `applyClassFillResult` and `failClassFill`; `applyLlmResult` routes both class routes; `applyLlmFailure` sends a failed reveal back to AWAITING_ARCHETYPE and a failed fill to CLASS_FILL_ERROR, both keeping Plan 43-03's `resting ? LLM_RESTING_LINE : ...`. World branches untouched.
- `reducers/creation.ts`: `CLASS_FILLING` case (patience line), `CLASS_FILL_ERROR` case (`retryClassFill`), go-back blocked at CLASS_FILLING, `CLASS_FILL_ERROR` goes back to AWAITING_ARCHETYPE, two resume lines in `start_creation`.
- `llm_sweeper.ts`: `CREATION_LOCKS` maps GENERATING_RACE to creation_race, GENERATING_CLASS to creation_class_reveal (back to AWAITING_ARCHETYPE, flicker line) and CLASS_FILLING to creation_class (back to CLASS_FILL_ERROR, `CLASS_FILL_FAILED_LINE`); the release posts the lock's own line and the held set counts all three routes.

## Final copy of every new creation line

- `CLASS_REVEAL_MILESTONE_LINE`: "That is the shape of you. The rest of your abilities are still being worked out, so do not touch anything."
- `CLASS_FILL_FAILED_LINE`: "The Keeper loses the thread of your finer details. Your class and first ability stand. Say anything and he will try the rest again."
- `CLASS_FILL_PATIENCE_LINE`: "The Keeper is still working out the rest of what you can do. Patience."
- `CLASS_FILL_RETRY_LINE`: "The Keeper picks the thread of your finer details back up..."
- start_creation resume at CLASS_FILLING: "The Keeper is still working out the rest of what you can do. Patience is a virtue you clearly lack, but try anyway."
- start_creation resume at CLASS_FILL_ERROR: "The rest of your abilities slipped away from the Keeper. Say anything and he will try again, or type \"go back.\""
- Reveal event: `<description>` / `**<ClassName>**` / "Your first ability:" / `<Ability name> — <description>` plus the mechanics line / the milestone line (the ability name has no square brackets, so it is not a click target before the fill lands).

## Characterization snapshot changes

Reviewed with `diff` of snapshot entries against HEAD (script comparing entry keys and bodies): 144 entries before, 152 after; every non-class entry is byte-identical. Only class entries changed.

Removed (7, replaced by the staged cases):
- llm apply creation replies: Phase 41 clamped > Phase 41: clamped - a class reply with over-budget ability values is stored clamped
- llm apply creation_class success > Phase 41: a null ability entry is dropped, not fatal (the old midway throw and revert is gone)
- llm apply creation_class success > Phase 41: an empty object stores "Unknown Class" with default stats and prints "**Unknown Class**"
- llm apply creation_class success > Phase 41: legacy ability field names are not read (vocabulary defaults apply) on a mana-user class line
- llm apply creation_class success > applies a valid reply: CLASS_REVEALED, stats, abilities, presentation event
- llm apply creation_class success > malformed JSON reverts to AWAITING_ARCHETYPE
- llm apply failure path: creation and skill_gen > creation_class failure appends creation_error and reverts the step to AWAITING_ARCHETYPE

Added (15):
- failure path: creation_class_reveal failure reverts to AWAITING_ARCHETYPE; creation_class (fill) failure sets CLASS_FILL_ERROR and keeps the reveal
- creation_class_reveal success (stage 1): valid reply; Phase 41 legacy field names on a mystic first ability; Phase 41 firstAbility {} defaults; malformed JSON; no usable firstAbility
- creation_class success (stage 2, the fill): valid reply; Phase 41 legacy field names on a mana-user class; Phase 41 stats missing from the reply; empty object adds no ability; malformed JSON; Phase 41 null ability entry
- Phase 41 clamped: class reveal with over-budget values; class fill with out-of-range stats and over-budget abilities (at most three)

## Task Commits

1. **Task 1 RED:** `1882692f` (test) - failing tests for the class helpers and lines
2. **Task 1 GREEN:** `b9942041` (feat) - reveal route, `buildClassFillInput`, `startClassFill`, `retryClassFill`, lines
3. **Task 2:** `ce08cd05` (feat) - class apply, failure handling, stage-aware `creationStateForJob`, apply tests, migrated characterization and snapshot
4. **Task 3 RED:** `e78b0c46` (test) - failing sweeper and reducer tests (15 reducer and 7 sweeper cases failed)
5. **Task 3 GREEN:** `237d40d9` (feat) - reducer steps, go-back rules, resume lines, sweeper locks

## Verification

- `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 src/helpers/creation_generation.test.ts src/helpers/llm_apply.test.ts src/helpers/llm_apply.characterization.test.ts src/helpers/llm_sweeper.test.ts src/reducers/llm_cutover.test.ts src/data/pronoun_rules.test.ts`: 6 files, 490 tests pass.
- `CI=true pnpm exec vitest run --maxWorkers=1` (full root suite): 68 files, 3101 tests pass.
- `spacetime build -p spacetimedb`: "Build finished successfully" (pre-existing "tsc not found" notice).
- Acceptance greps: `buildClassFillInput|startClassFill|retryClassFill` exports = 3; `applyClassRevealResult|applyClassFillResult` exports = 2; `startClassFill(` in llm_apply.ts = 1; `CLASS_FILLING` in llm_apply.ts = 7; `case 'CLASS_FILLING'` = 1, `case 'CLASS_FILL_ERROR'` = 1; `retryClassFill(ctx, state)` in creation.ts = 1; `creation_class_reveal` in llm_sweeper.ts = 3; describe "staged class reveal (LAT-04)" present.
- No `spacetime publish`, `call` or `generate` was run; no Anthropic call; the local stack was not touched.

## Deviations from Plan

**1. [Rule 2 - Missing critical functionality] A fill that adds no usable ability fails the fill.** The plan says the fill "merges ... through the existing validateClassReply clamps" and a "malformed reply sets CLASS_FILL_ERROR", but `validateClassReply` never rejects, so `{}` or `abilities: []` would have produced a CLASS_REVEALED state with only the stage-1 ability, violating the plan's own prohibition. The apply now treats a merged result with fewer than two abilities as malformed (CLASS_FILL_ERROR, reveal kept, `CLASS_FILL_FAILED_LINE`). The Phase 41 characterization cases for `{}` and `[null]` replies therefore now pin CLASS_FILL_ERROR for the fill instead of CLASS_REVEALED with an empty list.

**2. [Rule 1 - Bug avoided] "try again" at CLASS_FILL_ERROR retries instead of going back.** `GO_BACK_PATTERNS` contains "try again", and the failed-fill line tells the player the Keeper will try again; typing that would otherwise have opened the unmake-your-class confirmation. At CLASS_FILL_ERROR only, that one phrase is excluded from go-back detection (every other go-back phrase still goes back). Pinned by a reducer test.

**3. [Process note] Task 2 TDD.** The Task 2 tests were written before the apply code and failed (63 failing before the dispatcher existed), but tests and implementation went into one commit (`ce08cd05`) rather than a separate RED commit, because the characterization snapshot had to be regenerated against the finished code. Tasks 1 and 3 have separate RED and GREEN commits.

**4. [Rule 3 - Blocking] The characterization harness seeds `llm_admin_state` empty, which fails the gate closed.** The reveal apply now enqueues, so the reveal cases use the file's existing `openGateCtx` helper (as the world stage-1 cases do). No production change.

## Known Stubs

None.

## Flagged assumption (confirm at verify)

LAT-04 unresolved edge row, as planned: if stage 2 fails, expires or is refused the class name, description and first ability stay (CLASS_FILL_ERROR), there is no static fallback ability set, any input retries stage 2 only, and go-back to the archetype choice stays available; while the kill switch or ceiling holds, the retry answers with the resting line.

## Notes for later plans

- Client: no change was needed (Plan 43-09 already excludes CLASS_FILLING and CLASS_FILL_ERROR from the input-locking list). The creation console shows the reveal event as an ordinary `creation` line.
- `llm_inputs.ts` `archetypeForPlayer`/`archetypeForCharacter` and the module bindings were not touched; no schema change, no regeneration needed (step values are plain strings).
- Plan 43-15 (local publish) is where this is first exercised against the real database.

## Threat Flags

None. T-43-43 (fill merged and clamped through validateClassReply, at most three abilities), T-43-44 (stage-1 facts are the clamped stored values, sanitized again by `buildCreationClassFillVolatile`), T-43-45 (one fill job at a time through the dedupe key, no automatic retry, caps/kill switch/ceiling through `enqueueLlmJob`) and T-43-46 (sweeper releases both class locks after 60 s, go-back available from CLASS_FILL_ERROR) are mitigated and tested. No new endpoint or trust boundary.

## Self-Check: PASSED

- Commits `1882692f`, `b9942041`, `ce08cd05`, `e78b0c46` and `237d40d9` exist on master.
- All ten files in the plan's `files_modified` exist and are committed; `.claude/settings.local.json`, `public/assets/logo.png` and `public/assets/logo_old.png` were never staged.
