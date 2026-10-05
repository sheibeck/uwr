---
phase: 39-procedure-to-claude-spike
plan: 11
subsystem: testing
tags: [maincloud, guard, measurement, gate, spacetimedb, procedure]

requires:
  - phase: 39-08
    provides: load runner, harness, local provisional results
provides:
  - SPIKE_TARGET opt-in target selection (local default, maincloud only for uwr-spike-925iv) with a guard that allows one exact publish argument list
  - validateResults 'gate' profile and multi-file recorded-results discovery (kept, tested)
  - 39-maincloud-results.json, the maincloud-only raw measurements for the decisive gate
affects: [39-09, 39-10, phase-41]

tech-stack:
  added: []
  patterns:
    - "Target table in config.ts drives every guard, builder and results path; SPIKE_TARGET unset means local exactly as before"
    - "Maincloud guard compares the whole publish argument list token by token; every other maincloud subcommand needs --server maincloud and the one database name"

key-files:
  created:
    - scripts/spike/sanity.live.ts
    - .planning/phases/39-procedure-to-claude-spike/39-maincloud-results.json
  modified:
    - scripts/spike/config.ts
    - scripts/spike/cli.mjs
    - scripts/spike/guards.live.ts
    - scripts/spike/leak-scan.mjs
    - scripts/spike/harness.ts
    - scripts/spike/load.live.ts
    - spacetimedb/src/helpers/measurement_results.ts
    - spacetimedb/src/helpers/measurement.results.test.ts

key-decisions:
  - "Gate results profile only requires the sections the gate reads; the full profile stays the default so the local file is still checked in full"
  - "Maincloud load windows are sized by the same filters the gate applies (client-outstanding pings at the level minimum, ticks at the effective concurrency minimum)"
  - "Maincloud results file carries memory as [] with load.memoryNote, since a hosted database has no host process access"

requirements-completed: []

coverage:
  - id: D1
    description: "Target-aware guard reaches only local uwr-spike by default, and with SPIKE_TARGET=maincloud only uwr-spike-925iv; exact publish list, no delete, no uwr, no clear/break-clients/anonymous flags"
    requirement: SPIKE-04
    verification:
      - kind: unit
        ref: "pnpm exec vitest run --config scripts/spike/vitest.spike.config.ts scripts/spike/guards.live.ts (35 pass)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Kept results test validates every 39- results file, gate profile for maincloud names, full profile otherwise"
    requirement: SPIKE-04
    verification:
      - kind: unit
        ref: "pnpm --dir spacetimedb exec vitest run src/helpers/measurement.results.test.ts (109 pass); pnpm --dir spacetimedb test (739 pass)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Maincloud leg recorded: ladder 10/10/30 all ok, 50 no-op dispatches, sender, region compile plus skill pair, idle baseline, load 8/4/2, baseline2, key replaced by a placeholder, every leak scan clean"
    requirement: SPIKE-03
    verification:
      - kind: integration
        ref: "Task 3 node check exits 0; measurement.results.test.ts validates 39-maincloud-results.json (gate profile, partial); leak-scan LEAK-SCAN: CLEAN after every live step"
        status: pass
    human_judgment: false

duration: 30min
completed: 2026-09-29
status: complete
---

# Phase 39 Plan 11: Maincloud Leg Summary

**On maincloud (database uwr-spike-925iv) every non-drill call succeeded (10/10 public URL, 10/10 models, 30/30 Sonnet 5.5, region schema compiles), dispatch p95 was 3.0 ms, ping and tick p95 stayed at baseline (limit 2x) at 8, 4 and 2 in flight with the platform allowing 8 concurrent procedure calls, and the run spent 1,147,112 micro-USD.** No verdict is computed here (Plan 09 does that).

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | Target selection and the maincloud guard | c5272d81 |
| 2 | Gate results profile, multi-file discovery, maincloud-aware harness, sanity pair | 68687be3 |
| 3 | Publish through the guard and run the maincloud leg | 39d0c146 |

## Task 3 record

**Step 1 preconditions**
- Permission record (39-CONTEXT.md line 48): "Therefore **Claude publishes the spike module to `uwr-spike-925iv` through the guard**, never with clear or delete flags." (line 46-47 quote the user's grant: "I give you permission to publish to uwr-spike db in maincloud").
- `spacetime login show`: `You are logged in as c200252497b98fff5aab75f8fbc675956b5a12a5b85042ab355d3a05c6ab7d6e`.
- `git status --porcelain -- spacetimedb/src`: empty (the published module is the committed tree).
- Guard tests passed (35); `set-key.mjs --dry-run`: `ANTHROPIC_API_KEY: present (format ok, len 108)`.

**Step 2 publish** (`SPIKE_TARGET=maincloud node scripts/spike/cli.mjs publish`, exit 0; the only publish run against maincloud, no delete ever run): the guard's argument list was `publish uwr-spike-925iv -p spacetimedb --server maincloud --no-config --yes=remote`. Scrubbed tail of the output: `Build finished successfully.` / `You are about to publish to a non-local server: maincloud.spacetimedb.com` / `Skipping confirmation due to --yes` / migration plan listing 134 "Created" items (empty database, no break-clients or delete-data prompt) / `Publishing module...` / `Updated database with name: uwr-spike-925iv, identity: c200d8595d7376690d03566fdd8e9a30038dfac72f1ea53dfa594ad0a4068fd8`. (A `tsc not found in node_modules` line was printed by the CLI after the publish; the publish itself succeeded.)

**Step 3 describe** (exit 0): lists `spike_direct_call`, `spike_result`, `spike_state`, `spike_tick_sample`, `spike_run_job` (plus spike_echo, spike_enqueue, spike_job, spike_ping, spike_reset, spike_set_key, spike_set_phase, spike_tick, spike_whoami and index names).

**Step 4 identity:** `spike_whoami sender=c200252497b98fff5aab75f8fbc675956b5a12a5b85042ab355d3a05c6ab7d6e` (matches; no edits needed).

**Step 5 no-spend leg:** smoke.live.ts passed (environment written: serverPid null, cliSenderMatchesGate true). Build tag actually in the published source is `'b'` (SPIKE_BUILD_TAG in llm_spike.ts); smoke.live.ts hard-codes `buildTags: ['a']`, so the recorded `environment.buildTags` says `a`; use `b` in the record's Environment section. free.live.ts passed:
- rung 1: 10/10 ok, callMs p50 42.1, p95 71.0
- 50 no-op dispatches: late ms p50 2.20, p95 3.00, max 3.15 (ctx cross-check p95 2.80); noop procedure e2e p50 31.2, p95 36.5 ms
- 8-job burst dispatch late ms: 253.7, 291.4, 162.5, 193.1, 133.9, 111.0, 222.0, 2.3 (information only, not a gate input)
- sender.scheduled: senderHex = the database identity c200d859..., isModuleIdentity true, hasConnectionId false, usable true; sender.direct: the caller identity, hasConnectionId true
- echo push leg p50 28.7, p95 33.0 ms
- drills: timeout throws ("operation timed out", class platform); bad key returns 401 authentication_error (class auth); headers visible: request-id yes, retry-after not observed
- leak scan: `real-key needle: loaded`, `server-logs (maincloud): scanned pattern=0 needle=0`, `LEAK-SCAN: CLEAN`

**Step 6 key:** `key stored: yes (len 108)` (key never printed); leak scan `LEAK-SCAN: CLEAN` (same three lines).

**Step 7 ladder** (bounded re-run not needed): publicUrl 10/10, models 10/10, reliability 30/30 ok on attempt 1; rung 3 callMs min 576, p50 699, max 1165; spend 2,280 micro-USD; leak scan clean.

**Step 8 sanity pair:** region compile `compiles=true status=200 parsedOk=true requiredKeysOk=true`, stop end_turn, clientE2eMs 18,568, callUs 18,528,685, cost 25,677 micro-USD; skill call at effort low: status 200, end_turn, clientE2eMs 5,200, callUs 5,168,761. Leak scan clean.

**Step 9 load** (356 s, log in gitignored scripts/spike/out/maincloud-load.log). Baseline p95 ping 34.30 ms, tick 2.72 ms (1300 pings, 66 ticks). Limits are 2x baseline (68.6 ms ping, 5.43 ms tick).

| Level | Calls ok | Extended | Filtered pings | Filtered ticks | Ping p95 (ms) | Tick p95 (ms) | Ping | Tick |
|---|---|---|---|---|---|---|---|---|
| 8 (ping min 6, tick min 6) | 32/32 | yes (24+8) | 1417 | 71 | 34.57 | 2.61 | PASS | PASS |
| 4 (min 3) | 15/15 | yes (12+3) | 1406 | 71 | 33.47 | 2.73 | PASS | PASS |
| 2 (min 2) | 8/8 | yes (6+2) | 1321 | 66 | 35.21 | 2.69 | PASS | PASS |

baseline2 p95: ping 34.73 ms, tick 2.59 ms (1300 pings, 66 ticks).

Label histograms (value:count):
- level 8 pings (client outstanding): 1:13, 2:8, 3:5, 4:9, 5:15, 6:33, 7:87, 8:1297; ticks (server in-flight): 1:1, 4:1, 6:2, 7:6, 8:63
- level 4 pings: 1:21, 2:25, 3:315, 4:1091; ticks: 1:1, 2:1, 3:16, 4:55
- level 2 pings: 1:153, 2:1321; ticks: 1:8, 2:66

**Observed maincloud concurrency cap: 8** (highest tick label over all levels; the server ran all 8 at once, unlike the local runtime's cap of 4). Gate windows (from the kept helper): level 8 effective 8, level 4 effective 4, level 2 effective 2. **No SHORTFALL lines** (every level above 200 filtered pings and 30 filtered ticks). Memory: `[]` with note "unavailable on maincloud: no host process access". Estimated harness spend 1,147,112 micro-USD. Leak scan clean.

**Step 10 key removed:** `set-key.mjs --value-from-env SPIKE_KEY_PLACEHOLDER` printed `key stored: yes (len 25) [canary value]` (placeholder in place; any further paid enqueue fails with a free 401). `cli.mjs state`: phase idle, probe_on false, in_flight 0, calls 111, **est_cost_micro_usd 1,147,112**, reserved 0. Both the module count and the harness estimate are equal and below the 1,800,000 harness ceiling (module cap 2,400,000). Final leak scan: clean (all 9 lines, real-key needle loaded, maincloud server-logs pattern=0 needle=0).

**Step 11:** `pnpm --dir spacetimedb exec vitest run src/helpers/measurement.results.test.ts` passes (109 tests) with both files discovered: 39-maincloud-results.json (gate profile, partial) and 39-spike-results.json (full).

**Step 12:** committed only 39-maincloud-results.json (39d0c146).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Local target now requires --server local on server commands**
- **Found during:** Task 1
- **Issue:** the plan's behavior list says the local guard requires `--server local`; the old guard let a missing --server through.
- **Fix:** every server command (publish, call, logs, sql, describe, delete) must name --server on both targets; generate is exempt. Existing local builders already pass it.
- **Files modified:** scripts/spike/cli.mjs, scripts/spike/guards.live.ts
- **Commit:** c5272d81

### Incident (not in the plan): unintended local paid run

- **What happened:** while checking that load.live.ts collects (`vitest list` prints nothing for that file, the same as for the pre-change version), I ran `vitest run` on load.live.ts with SPIKE_TARGET unset. That started the LOCAL paid load. I killed the vitest process tree after under two minutes.
- **Effect:** 30 extra region calls on the local uwr-spike database (calls 1389 to 1419; module est_cost 1,517,848 to 2,129,654 micro-USD, about $0.61). The local results file was not written (its mtime is unchanged, 18:23), so the local file's harness estimate (1,517,848) is now below the module count (2,129,654). I reset the local probe (`spike_reset false`: phase idle, probe_on false, in_flight 0, reserved 0). Local headroom under the 2.4M cap is now 270,346 micro-USD.
- **Impact on later plans:** no maincloud impact. Plan 09/10 should not run any further local paid calls; the local spend is within the 2.4M per-database cap and the $10 workspace limit (combined spend so far about $2.13 local + $1.15 maincloud = $3.28).
- **Follow-up done:** ran the local free dry run afterwards (SPIKE_LOAD_DRY_RUN=1, passes, spends nothing) to confirm the edited runLevel still works on the local path.

### Notes for Plan 09

- `environment.buildTags` in the maincloud file says `a` (hard-coded by smoke.live.ts); the published source's tag is `b`.
- The maincloud results file has no verdict, no canary and no hop section by design (gate profile).
- Level 4 and level 2 windows on maincloud were extended by one round each because the harness sizes windows to 250 filtered pings; extended=true on all three levels.
- Only local `uwr-spike` and maincloud `uwr-spike-925iv` were touched; the database `uwr` was never touched on any server, and no delete ran against maincloud.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

- Files: scripts/spike/config.ts, cli.mjs, guards.live.ts, leak-scan.mjs, harness.ts, load.live.ts, sanity.live.ts, measurement_results.ts, measurement.results.test.ts and 39-maincloud-results.json all exist.
- Commits c5272d81, 68687be3 and 39d0c146 exist.
- Guard tests 35 pass; spacetimedb suite 739 pass; results test 109 pass; final maincloud leak scan CLEAN.
