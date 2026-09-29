---
phase: 39-procedure-to-claude-spike
plan: 02
subsystem: testing
tags: [spacetimedb, procedure, scheduled, anthropic, spike, sonnet-5-5]

requires:
  - phase: 39-01
    provides: classifyFailure, reserveCostMicroUsd, settleCostMicroUsd, redactSecrets, Usage
provides:
  - throwaway spike module inside the real SpacetimeDB module (five isolated tables, pure request builders/parsers, scheduled and direct-call procedures, tick probe, control reducers)
  - two-edit fully revertible production registration (schema/tables.ts + index.ts)
affects: [39-03, 39-04, 39-05, 39-06, 39-07, 39-08, 39-09, 39-10]

tech-stack:
  added: []
  patterns:
    - "registerSpike(spacetimedb) called after registerReducers so the _wrapMethod patch already exists and exports are collected by name"
    - "Procedure runSpec: reserve spend in tx1, fetch outside any transaction, settle and write the result row in tx2"
    - "onSchedule binding for both a procedure (spike_run_job) and a reducer (spike_tick_probe), tables kept in a separate file with no schema/tables import"

key-files:
  created:
    - spacetimedb/src/spike/spike_tables.ts
    - spacetimedb/src/spike/spike_bodies.ts
    - spacetimedb/src/spike/spike_bodies.test.ts
    - spacetimedb/src/spike/llm_spike.ts
    - spacetimedb/src/spike/llm_spike.test.ts
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/index.ts

key-decisions:
  - "Spend cap is the code constant SPEND_CAP_MICRO_USD = 2_400_000n ($2.40); spike_reset preserves estCostMicroUsd and calls so a reset can never re-arm the budget"
  - "Reservation is charged only for billable calls (messages with the stored key); models, public_url, noop and bad-key drills reserve 0"
  - "A network spec with no spike_state row fails closed as spend_cap rather than running unmetered"
  - "models contentOk means a parseable data array; modelListed is a separate observation so an ID-format surprise cannot fail reliability by itself"
  - "Staged region routes append a one-line stage instruction to the same cut user prompt"
  - "An invalid spec reaching spike_run_job records a failed spike_result row instead of trapping"

patterns-established:
  - "Tests stub spacetimedb and spacetimedb/server with vi.mock (the real server module does not load in plain Node) and drive registerSpike through a fake spacetimedb that records registrations"
  - "Static source checks in the unit tests: balanced-paren extraction of every ctx.withTx body, then assert no async/await/fetch inside and exactly one fetch outside"

requirements-completed: []

coverage:
  - id: D1
    description: "Five isolated spike tables (two public, three private), no import of schema/tables.ts"
    requirement: SPIKE-01
    verification:
      - kind: unit
        ref: "grep public: true = 2, schema/tables = 0 in spike_tables.ts; module build"
        status: pass
    human_judgment: false
  - id: D2
    description: "Sonnet 5.5 request bodies (explicit effort, required max_tokens, no rejected params), mapped skill schema, hand-written region schemas, key attached only to api.anthropic.com, response parsing with stop_reason and required-key checks"
    requirement: SPIKE-02
    verification:
      - kind: unit
        ref: "spacetimedb/src/spike/spike_bodies.test.ts (43 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "runSpec/registerSpike: fetch outside withTx, spend reserve-and-settle with code-constant cap, key containment, CLI-identity gated key reducer, tick probe at COMBAT_LOOP_INTERVAL_MICROS, dispatch/sender recording"
    requirement: SPIKE-03
    verification:
      - kind: unit
        ref: "spacetimedb/src/spike/llm_spike.test.ts (34 tests, incl. static withTx/console/procedure-form checks)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Production diff is exactly two additive edits and the module builds and passes the full suite"
    requirement: SPIKE-01
    verification:
      - kind: unit
        ref: "pnpm --dir spacetimedb run build; pnpm --dir spacetimedb test (696 passed, 4 skipped)"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-09-29
status: complete
---

# Phase 39 Plan 02: Spike Module Summary

**Throwaway scheduled-procedure-to-Claude measurement module inside the real SpacetimeDB module: pure Sonnet 5.5 request builders, a spend-capped three-step `runSpec`, a 1 s tick probe and control reducers, registered by a two-edit revertible production diff and built but not published.**

Phase-start SHA: 14b14f40d34a1edc871c557a95e2372530fa775b

(This is HEAD immediately before the registration edits; `spacetimedb/src/index.ts` and `spacetimedb/src/schema/tables.ts` are identical to their phase-start content at that commit, so the cleanup plan can diff both files against it and expect an empty result.)

## Performance

- **Duration:** about 25 min
- **Tasks:** 3 of 3
- **Files created:** 5 (all under `spacetimedb/src/spike/`); modified: 2

## Accomplishments

- `spike_bodies.ts`: `SpikeSpec`/`validateSpec`, `buildRequest` (model `claude-sonnet-5-5`, explicit `output_config.effort`, per-route `max_tokens` 256/4096/8192, no `temperature`/`top_p`/`top_k`/`budget_tokens`/`tool_choice`/prefill, `thinking` only as exactly `{ type: 'between_tools' }` for the exploratory variant), `toAnthropicSchema` (nullable type arrays become `anyOf`), module-constant `SKILL_JSON_SCHEMA` (mapped from the real `buildSkillGenResponseFormat()`), hand-written `REGION_JSON_SCHEMA` plus the `REGION_CORE_JSON_SCHEMA`/`REGION_POPULATION_JSON_SCHEMA` staged pair (every object has `additionalProperties: false` and lists all properties as required), `cutBeforeJsonInstruction`, and `parseResponse` (first text block, `stop_reason`, usage, required keys, error type, redacted message capped at 400).
- `llm_spike.ts`: `runSpec` follows tx1 (read `spike_state` and the private `llm_config` key, refuse over the cap, else reserve and bump `inFlight`/`calls`), fetch outside any transaction with a `TimeDuration` timeout, tx2 (settle, decrement, insert one `spike_result`). `registerSpike` registers `spike_run_job` (`onSchedule: SpikeJob`), `spike_direct_call`, `spike_tick_probe` (`onSchedule: SpikeTick`, reschedules at `COMBAT_LOOP_INTERVAL_MICROS`), `spike_whoami`, `spike_set_key`, `spike_reset`, `spike_set_phase`, `spike_ping`, `spike_echo`, `spike_enqueue`.
- Registration: one import plus five schema entries in `schema/tables.ts` (6 insertions, 0 deletions) and one import plus `registerSpike(spacetimedb);` immediately after `registerReducers(reducerDeps);` in `index.ts` (2 insertions, 0 deletions). `data/admin.ts` untouched.
- `pnpm --dir spacetimedb run build` succeeds and the bundle contains the spike exports; `pnpm --dir spacetimedb test` is green (696 passed, 4 skipped, up from 619 before this plan).
- Nothing was published; no `uwr`, `uwr-spike` or maincloud operation was run.

## Task Commits

1. Task 1 RED: `4e4c7466` test - failing tests for request builders and parsers
2. Task 1 GREEN: `555da7a1` feat - spike tables and pure request builders/parsers
3. Task 1 follow-up: `chore(39-02): reword spike_tables comment` (comment reworded so the `schema/tables` grep acceptance check is 0)
4. Task 2 RED: `2f7d01bd` test - failing tests for registerSpike, runSpec and static safety rules
5. Task 2 GREEN: `14b14f40` feat - registerSpike with scheduled procedure, tick probe and control reducers
6. Task 3: `561cb22e` chore - temporary registration of the spike module and tables

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Comment tripped the acceptance grep**
- **Found during:** Task 1 commit check
- **Issue:** A header comment in `spike_tables.ts` contained the text `schema/tables.ts`, making `grep -c "schema/tables"` return 1 instead of the required 0.
- **Fix:** Reworded the comment; no code change.
- **Files modified:** spacetimedb/src/spike/spike_tables.ts

**2. [Rule 3 - Blocking] The real `spacetimedb/server` and `spacetimedb` modules do not load in plain Node under Vitest**
- **Found during:** Task 2 test design (probe import failed with a SyntaxError)
- **Fix:** `llm_spike.test.ts` stubs both with `vi.mock`, the same approach other tests in this repo use. `spike_bodies.ts` has no SpacetimeDB imports so its tests need no stubs.
- **Files modified:** spacetimedb/src/spike/llm_spike.test.ts

**3. [Rule 2 - Missing critical functionality] Fail-closed and invalid-spec handling**
- **Issue:** The plan did not say what happens when `spike_state` is missing for a network spec, or when a scheduled job carries an unparseable spec.
- **Fix:** A missing state row blocks the call as `spend_cap` (never runs unmetered); an invalid spec in `spike_run_job` writes a failed `spike_result` row rather than trapping, so the harness can see it.
- **Files modified:** spacetimedb/src/spike/llm_spike.ts (covered by tests)

**Notes on scope choices (not deviations):** `spike_reset` also zeroes `pings` (a measurement counter, not money); `estCostMicroUsd` and `calls` are never touched. The tests found no defect in the implementation on first run, so there were no GREEN-phase fix loops.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. T-39-05 (key only to `api.anthropic.com`, unit-tested), T-39-06 (only key length logged, `redactSecrets` on all stored text, fake-key behavior test), T-39-07 (CLI identity gate, logs sender hex on rejection), T-39-08 (reserve-then-settle against a code constant, reset preserves spend), T-39-09 (two additive edits, SHA recorded, no publish) are mitigated and covered by tests.

## Self-Check: PASSED

- Files exist: spike_tables.ts, spike_bodies.ts, spike_bodies.test.ts, llm_spike.ts, llm_spike.test.ts (under `spacetimedb/src/spike/`)
- Commits in git log: 4e4c7466, 555da7a1, 2f7d01bd, 14b14f40, 561cb22e
- `git show --numstat 561cb22e` shows index.ts +2/-0 and schema/tables.ts +6/-0; `git diff --quiet -- spacetimedb/src/data/admin.ts` exits 0
- Acceptance greps: `onSchedule: SpikeJob` 1, `onSchedule: SpikeTick` 1, CLI identity constant 1, `public: true` 2 in spike_tables.ts
