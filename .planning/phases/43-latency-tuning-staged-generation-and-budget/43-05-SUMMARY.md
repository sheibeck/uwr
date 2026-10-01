---
phase: 43-latency-tuning-staged-generation-and-budget
plan: 05
subsystem: api
tags: [spacetimedb, llm, retry, smoke-test, indicator, snapshots, vitest]
status: complete

requires:
  - phase: 43-latency-tuning-staged-generation-and-budget
    provides: ten-route table, stage schemas, blocks and builders (Plan 43-04)
provides:
  - LLM_NO_AUTO_RETRY_ROUTES (7 routes) and LLM_SMOKE_ROUTES (8 routes)
  - Indicator lines, priority and console scope for all ten routes
  - Every route-enumerating test and the claude_request snapshots on the ten-route truth; full root suite green
affects: [43-06, 43-08, 43-09, 43-13, 43-15]

tech-stack:
  added: []
  patterns:
    - "Fill routes (creation_class, world_gen) keep no-auto-retry like stage 1: the player retries, nothing bills three times"

key-files:
  created: []
  modified:
    - spacetimedb/src/data/llm_limits.ts
    - spacetimedb/src/data/llm_limits.test.ts
    - spacetimedb/src/data/llm_indicator_lines.ts
    - spacetimedb/src/data/llm_indicator_lines.test.ts
    - spacetimedb/src/helpers/llm_retry.test.ts
    - spacetimedb/src/helpers/llm_budget.test.ts
    - spacetimedb/src/helpers/claude_request.test.ts
    - spacetimedb/src/helpers/__snapshots__/claude_request.test.ts.snap
    - src/composables/useLlmStatus.test.ts
    - spacetimedb/src/reducers/llm_admin.test.ts

key-decisions:
  - "The old creation_class and world_gen indicator lines moved to the stage-1 routes (creation_class_reveal, world_gen_start); the fill routes get new in-voice lines"
  - "The fixture for claude_request.test.ts gives the fill routes inputs with world-injected strings (class, first ability, region, start location, first NPC), so the hostile-versus-benign invariants still exercise the sanitized stage-1 facts"

patterns-established:
  - "Route-count assertions in llm_admin.test.ts follow LLM_SMOKE_ROUTES.length instead of literals"

requirements-completed: []  # LAT-03 and LAT-04 data layer only; standing rule: no requirements mark-complete

coverage:
  - id: D1
    description: "LLM_NO_AUTO_RETRY_ROUTES is exactly the seven routes and maxAttempts is 1 for each; LLM_ROUTE_NAMES has ten entries"
    requirement: LAT-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/data/llm_limits.test.ts, spacetimedb/src/helpers/llm_retry.test.ts#maxAttempts"
        status: pass
    human_judgment: false
  - id: D2
    description: "LLM_SMOKE_ROUTES warms both stage schemas of each split route (8 routes in the fixed order)"
    requirement: LAT-04
    verification:
      - kind: unit
        ref: "spacetimedb/src/data/llm_limits.test.ts, spacetimedb/src/reducers/llm_admin.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Indicator has a line, priority and console scope for every route; the eight non-null lines pass the voice and pronoun tests; the module has no import"
    requirement: LAT-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/data/llm_indicator_lines.test.ts, spacetimedb/src/data/pronoun_rules.test.ts"
        status: pass
      - kind: unit
        ref: "src/composables/useLlmStatus.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Request snapshots cover the ten routes; only the four stage routes changed or were added"
    requirement: LAT-04
    verification:
      - kind: unit
        ref: "spacetimedb/src/helpers/claude_request.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "Full root suite green (63 files, 2595 tests) and the module builds"
    requirement: LAT-03
    verification:
      - kind: unit
        ref: "CI=true pnpm exec vitest run --maxWorkers=1"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-10-01
---

# Phase 43 Plan 05: Retry, smoke and indicator data for the ten routes Summary

**The two stage-1 routes join the no-auto-retry and smoke sets, the indicator knows all ten routes in the Keeper voice, and every route-enumerating test and request snapshot is on the ten-route truth, so the full root suite is green again.**

## Accomplishments

- `llm_limits.ts`: `LLM_NO_AUTO_RETRY_ROUTES` = creation_race, creation_class_reveal, creation_class, world_gen_start, world_gen, combat_narration, smoke_test; `LLM_SMOKE_ROUTES` = smoke_test, creation_race, creation_class_reveal, creation_class, world_gen_start, world_gen, skill_gen, renown_perk_gen.
- `llm_indicator_lines.ts` (still import-free): creation_class_reveal "The Keeper is deciding what you are good for...", creation_class "The Keeper is sorting out the rest of what you can do...", world_gen_start "The Keeper is unrolling a map, with visible reluctance...", world_gen "The Keeper is filling in the rest of the map, grudgingly..."; priority world_gen_start, creation_race, creation_class_reveal, creation_class, world_gen, skill_gen, renown_perk_gen, npc_conversation; creation console scope = five creation and world routes; creation-only = race, reveal, fill class.

## Task Commits

1. **Task 1: limits and indicator entries** - `5639ed23` (feat)
2. **Task 2: enumerating tests and request snapshots** - `e33fa929` (test)

## Pinned tests changed

| File | Test | Change |
|---|---|---|
| llm_limits.test.ts | route lists are frozen arrays of valid names | no-auto-retry set pinned to the seven routes; smoke list pinned in order, length 8 |
| llm_retry.test.ts | maxAttempts (both tests) | one-attempt list gains the two stage-1 routes; "all eight routes" now "all ten routes", length 10 |
| llm_indicator_lines.test.ts | EXPECTED_LINES, priority order, console scope, creation-only, "non-null lines" | ten-route lines, eight-route priority, five-route console scope, three creation-only routes (and world_gen_start excluded), eight non-null lines |
| llm_budget.test.ts | reservation estimate for all routes | eight to ten |
| claude_request.test.ts | makeInputs fixture; "covers ... json routes" | fixture has the ten routes (reveal and start take the old stage-1 inputs; fill routes take stored stage-1 facts); json routes 5 to 7, text routes 3 |
| useLlmStatus.test.ts | priority order; creation console scope; game console scope | new priority list; five creation routes; world_gen_start shows in the game console and creation_class_reveal does not (one new assertion) |
| llm_admin.test.ts | smoke job, dispatch and re-run counts | literals 6, 7 and 12 replaced by `LLM_SMOKE_ROUTES.length`, `+ 1` and `* 2`; test titles no longer say "six"; phase-cap smoke cases untouched (Plan 43-06) |

## Snapshot entries (`claude_request.test.ts.snap`)

| Entry | Result |
|---|---|
| creation_class_reveal | added |
| world_gen_start | added |
| creation_class | changed (now the fill schema and block) |
| world_gen | changed (now the fill schema and block) |
| combat_narration, creation_race, npc_conversation, renown_perk_gen, skill_gen, smoke_test | byte-identical (checked by parsing HEAD against the working file) |

## Verification

- Task 1 gate (`llm_limits`, `llm_indicator_lines`, `llm_retry`, `pronoun_rules`): 98 tests pass.
- Task 2 gate (`llm_budget`, `claude_request`, `llm_admin` and `useLlmStatus`): 340 and 35 tests pass.
- Full root suite `CI=true pnpm exec vitest run --maxWorkers=1`: 63 files, 2595 tests, all green.
- `spacetime build -p spacetimedb`: "Build finished successfully" (the pre-existing "tsc not found" notice). `tsc --noEmit` reports no error in any file this plan touched (other files have pre-existing implicit-any errors).
- Acceptance greps: world_gen_start in the indicator module 4, import lines 0, creation_class_reveal in llm_limits 2, `LLM_SMOKE_ROUTES.length` in llm_admin.test 6.
- No `spacetime publish`, `call` or `generate` was run.

## Deviations from Plan

**1. [Process note] Mistaken full-suite snapshot update, reverted.** My first `-u` run put the flag before the path, so vitest treated the whole server suite as the target while the claude_request fixture was still missing the new routes. Only `claude_request.test.ts.snap` changed on disk (`git status` confirmed no other file); I reverted that one file with `git checkout --` (a file I had changed), fixed the fixture, and re-ran with the path first, then reviewed the snapshot diff by entry. No other snapshot was touched.

**2. [Scope note] One extra assertion** in `useLlmStatus.test.ts` (creation_class_reveal is out of game-console scope) to pin the new creation-only route; no existing expectation was weakened.

TDD: the red tests were Plan 43-04's; each task is a single commit (feat for the data, test for the enumerating tests).

## Known Stubs

None.

## Threat Flags

None. T-43-55 (both stage-1 routes are no-auto-retry; pinned by llm_limits and llm_retry tests) and T-43-56 (indicator module stays import-free; pinned by test) are mitigated.

## Self-Check: PASSED

- Commits `5639ed23` and `e33fa929` exist on master.
- All ten modified files are committed; `.claude/settings.local.json`, `public/assets/logo.png` and `public/assets/logo_old.png` were never staged.
