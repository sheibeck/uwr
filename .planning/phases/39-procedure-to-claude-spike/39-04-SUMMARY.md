---
phase: 39-procedure-to-claude-spike
plan: 04
subsystem: testing
tags: [spacetimedb, publish, harness, canary, identity, egress]

requires:
  - phase: 39-02
    provides: spike module (tables, reducers, spike_run_job, spike_direct_call, tick probe)
  - phase: 39-03
    provides: guarded CLI gateway, key runner, leak scanner, ResultsStore, live vitest config
provides:
  - uwr-spike published to the local server, spike-only generated bindings in scripts/spike/bindings
  - harness core (connect, ping, enqueue, runners, tick collection, diagnostics, rerun, budget check)
  - no-spend smoke and canary-key leak scan, environment and canary sections in the results file
affects: [39-05, 39-06, 39-07, 39-08, 39-09, 39-10]

tech-stack:
  added: []
  patterns:
    - "Harness connects anonymously with DbConnection.builder().withUri('ws://127.0.0.1:3000').withDatabaseName('uwr-spike'); rows and tick samples are only recorded after the subscription is applied, so earlier runs never pollute a window"
    - "Result rows are correlated by runId+seq, arrival time is performance.now() inside the onInsert callback, and all free text is passed through redactSecrets"
    - "Live files spawn set-key and leak-scan with the canary only in the child environment (LEAK_NEEDLE) and assert the canary never appears in captured output"

key-files:
  created:
    - scripts/spike/harness.ts
    - scripts/spike/smoke.live.ts
    - scripts/spike/canary.live.ts
    - scripts/spike/out/server-started.json (gitignored)
    - scripts/spike/bindings/ (gitignored, generated)
  modified:
    - .planning/phases/39-procedure-to-claude-spike/39-spike-results.json

key-decisions:
  - "runConcurrent is async and returns CallSample[]; a companion startConcurrent returns a live handle { outstanding(), done } so pingLoop can sample in-flight counts while the load runs (onStart hands the same handle to a runConcurrent caller)"
  - "toCallSample takes an optional row: undefined means the result row never arrived and yields a platform failure (rowMissing); an enqueue that the reducer rejects yields a request failure"
  - "The canary leaves the canary string in llm_config row 1 until the real key is stored; Plan 06 must store the real key with set-key.mjs (overwrites row 1) after this plan's clean scan"

patterns-established:
  - "Generated names: conn.reducers.spikePing / spikeEnqueue / spikeReset / spikeSetPhase / spikeSetKey / spikeWhoami / spikeEcho ({ camelCase args }), conn.procedures.spikeDirectCall({ specJson }) resolves to the dataJson string, conn.db.spikeResult and conn.db.spikeTickSample (row fields runId, dataJson, lateUs bigint, gapUs bigint, inFlight)"

requirements-completed: []

coverage:
  - id: D1
    description: "uwr-spike published to local only, uwr has no spike tables, spike bindings generated outside src/module_bindings"
    requirement: SPIKE-01
    verification:
      - kind: manual
        ref: "node scripts/spike/cli.mjs publish/probe-uwr/generate; git status --porcelain -- src/module_bindings empty; git check-ignore scripts/spike/bindings ok"
        status: pass
    human_judgment: false
  - id: D2
    description: "Harness drives spike_ping, tick probe and spike_direct_call end to end at zero spend; spike_whoami through the CLI equals the gate identity"
    requirement: SPIKE-03
    verification:
      - kind: integration
        ref: "scripts/spike/smoke.live.ts (50 pings, noop direct call sender check, 5 tick samples in 6 s, none after off, whoami equals CLI_IDENTITY)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Canary key stored and used by a scheduled and a direct call leaves zero hits everywhere; a procedure fetch reaches api.anthropic.com from local SpacetimeDB (401)"
    requirement: SPIKE-01
    verification:
      - kind: integration
        ref: "scripts/spike/canary.live.ts; node scripts/spike/leak-scan.mjs --require-server prints LEAK-SCAN: CLEAN"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-09-29
status: complete
---

# Phase 39 Plan 04: Publish, Harness Core, Smoke and Canary Summary

**uwr-spike is live on the local server, the Node harness round-trips every spike reducer and procedure at zero spend, spike_whoami matches the CLI identity, and a canary key used by a scheduled and a direct procedure fetch reached api.anthropic.com (401) with zero leak-scan hits.**

## Performance

- **Duration:** about 25 min
- **Tasks:** 3 of 3
- **Files created:** 3 committed (`harness.ts`, `smoke.live.ts`, `canary.live.ts`) plus gitignored `scripts/spike/bindings/` and `scripts/spike/out/server-started.json`

## Server

The local SpacetimeDB server was started by the phase orchestrator (PID 14384, `spacetimedb-standalone`, listening 127.0.0.1:3000) and reused here; this plan did not start or stop any server. `scripts/spike/out/server-started.json` records `startedBySpike: true` with `startedBy: "phase orchestrator"` and PID 14384, so Plan 39-10 knows the phase started it and stops that PID at the end. No other background process was started by this plan.

## Accomplishments

- Published `uwr-spike` (identity `c200b98f...49f4`) with `node scripts/spike/cli.mjs publish`: no clear flag, no `-y`, local server only. `probe-uwr` reports the local `uwr` database has no spike tables. The CLI prints "uwr spike tables: absent (unknown table (spike tables absent))", not the literal "uwr clean: true" quoted in the plan; the check itself (exit 0) passes.
- Bindings generated into `scripts/spike/bindings` (gitignored); `git status --porcelain -- src/module_bindings` is empty. Exact generated names are listed under patterns-established above; verified by running the harness against them.
- Harness (`scripts/spike/harness.ts`) exports: connectSpike, ping, enqueue, waitForResults, toCallSample, runSequential, runConcurrent (plus startConcurrent), pingLoop, collectTicks, resetProbe, setPhase, directCall, memorySnapshot, serverPid, captureLogs, captureFailureDiagnostics, runRungWithRerun, budgetCheck.
- Smoke (`smoke.live.ts`): identity non-empty; 50 pings all resolved (p50 13.2 ms, p95 30.1 ms, min 11.6, max 38.6, on an idle local server); direct noop call 29.7 ms with `senderHex` equal to the harness identity; probe on for 6 s gave 5 tick samples, none in the 3 s after it was turned off; `spike_whoami` through the CLI printed `sender=c200252497b98fff5aab75f8fbc675956b5a12a5b85042ab355d3a05c6ab7d6e`, equal to `CLI_IDENTITY`. Environment section written: spacetime 2.10.1, sdk 2.10.1, node v22.23.2, Windows_NT 10.0.19045, model claude-sonnet-5-5, buildTags [a], serverPid 14384, cliSenderMatchesGate true.
- Canary (`canary.live.ts`): a runtime-assembled canary (`sk-ant-CANARY-<32 hex>`, length 46) stored through `set-key.mjs --value-from-env LEAK_NEEDLE` ("key stored: yes"; the module logged only `len=46`). One scheduled `models` call and one direct `models` call both returned HTTP 401 from api.anthropic.com, so procedure egress works locally and the 2.0.1-style fetch failure did not reproduce. A bad-key minimal messages drill call also completed. `leak-scan.mjs --require-server` with the canary as needle: LEAK-SCAN: CLEAN (server-logs, data-logs, results, out, git-tracked, git-history scanned; record absent). Results file: `canary { hits: 0, locationsScanned: 6, fetchReachedAnthropic: true, statusSeen: 401 }` and `serverLogs[canary]` (100 lines). A follow-up scan without the needle also exits 0.
- Verification: `pnpm --dir spacetimedb test` 700 passed; `guards.live.ts` 18 passed; `smoke.live.ts` and `canary.live.ts` pass.
- The real key is now unblocked with respect to leaks (canary scan clean), but none exists yet; the canary value is still what `llm_config` row 1 holds until Plan 06 stores the real key.

## Task Commits

1. Task 1: no committed files (server reuse, publish, probe, generate; all outputs gitignored or database state)
2. Task 2: `51e7c20b` feat - harness core, smoke, environment section
3. Task 3: `5591bcaa` test - canary leak scan, canary and serverLogs sections

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Server reused from the orchestrator, not started**
- **Issue:** the plan's step 1 starts the server only when none is listening; the orchestrator had already started PID 14384.
- **Fix:** reused it and wrote `server-started.json` with `startedBySpike: true` (the phase started it) per the orchestrator note.

**2. [Rule 3 - Blocking] runConcurrent split into async wrapper plus startConcurrent**
- **Issue:** the acceptance grep requires `export async function runConcurrent`, while the plan also asks for a live `outstanding()` counter.
- **Fix:** `runConcurrent` is async and returns `CallSample[]`; `startConcurrent` returns `{ outstanding(), done }`, and `runConcurrent` accepts `onStart(handle)`.

**3. [Documentation] probe-uwr output wording**
- The acceptance text `uwr clean: true` does not match the Plan 03 CLI wording; the exit code and message confirm the same fact. No code change.

**Total deviations:** 3, none affecting scope.

## Known Stubs

None.

## Threat Flags

None. All calls targeted 127.0.0.1:3000 and the `uwr-spike` database; `uwr` was only touched by the fixed read-only probe query.

## Issues Encountered

None. `spacetime publish` and `generate` print "tsc not found in node_modules" after success; both finished successfully and this is informational.

## Self-Check: PASSED

- FOUND: scripts/spike/harness.ts, scripts/spike/smoke.live.ts, scripts/spike/canary.live.ts, scripts/spike/bindings/index.ts, scripts/spike/out/server-started.json
- FOUND commits: 51e7c20b, 5591bcaa
