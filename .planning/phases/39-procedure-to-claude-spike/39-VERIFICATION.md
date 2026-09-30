---
phase: 39-procedure-to-claude-spike
verified: 2026-09-29T20:45:00Z
status: passed
score: 4/4 roadmap success criteria verified (plus all revised plan-level truths)
behavior_unverified: 0
overrides_applied: 0
re_verification: false
deferred: []
notes:
  - "39-10 'user deletes maincloud DB / describe must fail not-found' truth was replaced by the user-approved 'DB intentionally kept, STATE.md note with delete command' (accepted deviation, not a gap)."
  - "SPIKE-01..04 unchecked in REQUIREMENTS.md by orchestrator design (marked at phase completion), not a gap."
  - "Non-blocking follow-ups from 39-REVIEW.md (CR-01, CR-02, WR-01..07, IN-01..05) concern the kept helpers; none invalidates the recorded verdict (independently recomputed below)."
---

# Phase 39: Procedure-to-Claude Spike Verification Report

**Phase Goal:** The operator knows, from measured evidence on maincloud (with local results as context), whether SpacetimeDB 2.10 procedures can call Claude reliably without hurting combat ticks and reducers, and which executor the rest of the milestone will build.
**Verified:** 2026-09-29
**Status:** passed
**Re-verification:** No, initial verification

Judged against the REVISED 39-CONTEXT.md and plans (maincloud decides the gate; local is provisional context; `uwr-spike-925iv` kept by user at cleanup). SUMMARY claims were not trusted: I recomputed the decisive maincloud verdict from the raw samples in `39-maincloud-results.json` with independent code, re-ran the kept helper tests, and checked the repo state after cleanup.

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Throwaway procedure on local 2.10 reaches a public URL, `GET /v1/models`, then a small `claude-sonnet-5-5` call; each step's result plus server logs (incl. 2.0.1-style failure cause if reproduced) recorded | VERIFIED | SPIKE-RECORD "Ladder (SPIKE-01)" table: local 10/10, 10/10, 30/30 (rung-3 e2e p50 1051 ms); maincloud same counts. I recounted maincloud `ladder.publicUrl + models + reliability` = 50 calls, 0 failures. "Server logs" section holds redacted excerpts for both targets (results file `serverLogs` present, 6 entries local). Record states the 2.0.1-style failure does not reproduce (procedure reached api.anthropic.com; canary run returned HTTP 401 per 39-04-SUMMARY). |
| 2 | Structured outputs with real skill and region schemas at effort low and medium (latency, success, region-schema compile, thinking-off composition); observed failure shape of forced timeout and bad key; whether `retry-after` / `request-id` visible | VERIFIED | Local results: 20 structured cells (5 each skill/region x low/medium), record tables p50/p95; region schema `compiles: true` (also re-confirmed on maincloud: `regionCompile.compiles=true`, status 200, `end_turn`); `thinkingOffComposable: true`; headers `requestIdVisible: true`, `retryAfterVisible: "not_observed"`; drills: timeout = `fetch` throws "operation timed out" (class platform), bad key = 401 authentication_error with request-id visible (both targets, 2+2 drills, present in maincloud `drills` block which I read). |
| 3 | Scheduled-dispatch latency p50/p95, `ctx.sender` inside scheduled procedure, reducer and tick latency with 6-8 in flight vs no-call baseline | VERIFIED | Maincloud: I recomputed dispatch p95 = 3.003 ms over 50 samples (record: 2.20/3.00). `sender.scheduled`: module identity, no connection id, usable=true (results JSON). Ping/tick p95 at 8/4/2 in flight vs baseline recomputed independently: ping 1.01x/0.98x/1.03x, tick 0.96x/1.01x/0.99x (baseline ping p95 34.30 ms, tick 2.715 ms; n = 1300/66). Server-in-flight labels show 8 concurrent actually ran on maincloud. Local (provisional) numbers also present. |
| 4 | Written go/no-go decision record names the executor by applying the gate to a separate maincloud spike DB (`uwr-spike-925iv`); local recorded as provisional; production `uwr` never touched | VERIFIED | `39-SPIKE-RECORD.md` "Decision" section: maincloud strict verdict `go` (cap none) -> scheduled-procedure executor for Phase 41; in-flight cap <= 8; "Confirmation" section records user reply "confirm-strict" (also stored as `verdict.confirmation` in `39-maincloud-results.json`, `role: "decisive"`; local file `role: "provisional"`, strict `incomplete`, `ping@4 147/200`). Gate table side by side with thresholds. Decision logged in PROJECT.md (lines 113, 125) and STATE.md (lines 62, 63, 82, 89). Production module restored: `git diff 14b14f40 -- spacetimedb/src` (excluding `helpers/measurement*` and the removed spike dir) is empty; `llm-proxy` and `src/module_bindings` diffs empty; `git grep uwr-spike -- spacetimedb/src` empty. |
| 4a | "Also captured" items (feed later phases, not gate inputs) | VERIFIED | Cache read on repeated prefix (`cache.pair`, cacheRead 3727 tokens), #4954 direct call, publish-survival (`extras`), composed current-path overhead, all in the record. Local only, as scoped. |

**Score:** 4/4 truths verified (0 present-but-behavior-unverified). No truth here is a code state-transition invariant; the deliverable is measured evidence plus a decision, and the evidence was independently recomputed.

### Independent gate recomputation (maincloud, decisive)

| Check | Threshold | My recompute from raw samples | Record | Result |
|-------|-----------|-------------------------------|--------|--------|
| Reliability (non-drill) | 0 failures | 0 failures (levels 8/4/2: 32/15/8 calls all ok; ladder 50/50; reliability list 30) | 0/164 | PASS |
| Dispatch p95 | < 250 ms | 3.003 ms (n=50) | 3.003 | PASS |
| Ping p95 @8/4/2 | < 2x baseline (68.6 ms) | 34.57 / 33.47 / 35.21 ms (n=1417/1406/1321) | same | PASS |
| Tick p95 @8/4/2 | < 2x baseline (5.43 ms) | 2.61 / 2.73 / 2.69 ms (n=71/71/66) | same | PASS |
| Region schema compiles | true | true | true | PASS |
| Sample minimums | 200 ping, 30 tick, 50 dispatch, 30 reliability | all met | complete | PASS |

Verdict `go` reproduces. `go` maps to the scheduled-procedure executor per the ROADMAP gate outcome. Observed local server concurrency cap (4) vs maincloud (8) is recorded and carried into the Phase 41 in-flight cap (<= 8).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `39-SPIKE-RECORD.md` | Decision record with gate table, environment, decision, cap, implications, confirmation | VERIFIED | 280 lines, all sections present, numbers match raw JSON |
| `39-maincloud-results.json` | Raw maincloud samples, decisive verdict + confirmation | VERIFIED | Tracked in git; `verdict.role=decisive`, strict/floor-adjusted `go`, `confirmation.outcome=confirm-strict` |
| `39-spike-results.json` | Raw local samples, provisional verdict | VERIFIED | Tracked; `verdict.role=provisional`, strict `incomplete` with diagnostics |
| `spacetimedb/src/helpers/measurement.ts`, `measurement_results.ts` (+ two test files) | Kept, unit-tested percentile/gate/results helpers | VERIFIED | Present; `vitest run src/helpers/measurement` = 2 files, 188 tests passed (run by me) |
| Spike module and harness | Deleted at cleanup | VERIFIED | `spacetimedb/src/spike` and `scripts/spike` do not exist; cleanup commit e5f414d9 |
| Decision in PROJECT.md / STATE.md | Logged | VERIFIED | Present (see criterion 4) |

### Key Link / Wiring Verification

| From | To | Via | Status |
|------|----|-----|--------|
| Raw results JSON | Verdict in record | `measurement.results.test.ts` recomputes verdicts (109 tests) + my independent recompute | WIRED |
| Verdict -> executor | ROADMAP Phase 41 go branch | Record "Decision"/"Implications" name scheduled procedure; PROJECT.md/STATE.md updated | WIRED |
| Production module isolation | `index.ts` / `schema/tables.ts` | Diff vs phase-start SHA 14b14f40 empty | WIRED (isolated) |

### Data-Flow Trace (Level 4)

Not applicable: no dynamic-rendering artifacts. Evidence flow (raw samples -> gate -> record) verified via recompute above.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Kept helper unit tests incl. both recorded-results validations | `pnpm --dir spacetimedb exec vitest run src/helpers/measurement` | 188 passed | PASS |
| Maincloud verdict reproducible from raw samples | independent node script over `39-maincloud-results.json` | matches record (table above) | PASS |
| No key material in tracked files | `git grep -E 'sk-ant-[A-Za-z0-9_-]{20,}'` | empty (only docs describing the pattern / canary shape in planning text, no live key) | PASS |
| Cleanup left production module unchanged | `git diff 14b14f40 -- spacetimedb/src (minus helpers/measurement*, spike)` | empty | PASS |

Step 7c probe execution: no `probe-*.sh` scripts declared; SKIPPED. Full build/suite (`pnpm --dir spacetimedb test`, 666 tests) not re-run by me; 39-10 reports it green, and the measurement subset was re-run.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| SPIKE-01 | 39-02,03,04,05,06,09,11 | Local procedure reaches public URL, `/v1/models`, small Sonnet 5.5 call; results and logs recorded | SATISFIED | Ladder table + server logs in record; results JSON |
| SPIKE-02 | 39-02,05,07,09,11 | Structured outputs with real skill/region schemas at low/medium; timeout and bad-key failure shapes | SATISFIED | Structured section, drills, headers |
| SPIKE-03 | 39-02,04,05,08,09,11 | Dispatch latency, `ctx.sender`, reducer/tick latency with 6-8 in flight | SATISFIED | Dispatch/sender/load sections; recomputed |
| SPIKE-04 | 39-01,03,09,10,11 | Written go/no-go decision record picks executor with gate | SATISFIED | Decision + Confirmation in record; gate reproduced |

All four IDs appear in PLAN frontmatter and REQUIREMENTS.md; no orphaned Phase 39 requirements. REQUIREMENTS.md checkboxes / traceability rows still "Pending" by orchestrator design.

### Anti-Patterns Found

TBD/FIXME/XXX debt-marker scan on the kept helper files (only code modified and still present): none found. The spike code is deleted, so its markers are moot.

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `spacetimedb/src/helpers/measurement*.ts` (39-REVIEW CR-01) | `Partial<typeof GATE_DEFAULTS>` literal typing: `tsc` errors for non-default thresholds | Warning (not a goal gap) | Vitest passes (no typecheck); a future typechecked consumer cannot pass `noiseFloorMs: 25`. Does not alter the recorded verdict. |
| `measurement.results.test.ts` (CR-02, WR-07) | Recorded-results suites skip silently if `39-*` dir is archived/renamed; verdict reproduction couples to live defaults | Warning | Future maintenance trap; today both files are found and validated (109 tests). |
| `measurement.ts` / `measurement_results.ts` (WR-01..06, IN-01..05) | Edge-case validation/redaction/cost bugs, helpers orphaned after harness deletion | Warning / Info | Handled by the separate review-fix step; none changes the maincloud numbers, which I recomputed without these helpers. |

WR-05 (a level can pass without the server reaching `goMinInFlight`) does not affect the decisive result: maincloud tick labels show 63 of 71 ticks at 8 in flight and an observed cap of 8, so the go level genuinely ran at 8.

### Human Verification Required

None outstanding. The manual items in 39-VALIDATION (Anthropic key/workspace, verdict confirmation, maincloud publish grant) were completed and recorded by the user. The one remaining user action is optional and already documented in STATE.md: delete `uwr-spike-925iv` when no longer needed (`spacetime delete uwr-spike-925iv --server maincloud --no-config`); the database holds only a 25-char placeholder key.

### Deviations Accepted (user-approved)

- 39-10: maincloud DB `uwr-spike-925iv` kept rather than deleted; "describe must fail not-found" gate replaced by info-only existence check plus STATE.md note. Not a gap.
- Local strict verdict is `incomplete` (`ping@4` 147/200); by the revised CONTEXT it is provisional context, not a decision input.

### Observations (informational, no action required for this phase)

- Spend: about $3.28 combined ($2.13 local module count incl. ~$0.61 from the 39-11 executor's accidental local run, $1.15 maincloud) versus the original "under ~$3" design target; within the $10 workspace limit and fully disclosed in the record's Spend and Incident sections.
- The maincloud leg ran the gate-required subset (ladder, dispatch, sender, sanity pair, load 8/4/2) rather than the full structured matrix; the matrix is local-only. This matches the revised scope (the gate, not SPIKE-02 matrix, moved to maincloud) and the record labels it clearly.
- The maincloud evidence is a single ~6-minute session; the record explicitly states this limit and that Phase 41 re-proves the real executor on maincloud (ROADMAP Phase 41 SC6).

## Gaps Summary

No gaps. The phase goal is achieved: the operator has measured maincloud evidence (independently recomputed here), local results recorded as provisional context, a user-confirmed decision record selecting the scheduled-procedure executor (in-flight cap <= 8), and a clean production module after cleanup.

---

_Verified: 2026-09-29_
_Verifier: Claude (gsd-verifier)_
