---
phase: 39-procedure-to-claude-spike
reviewed: 2026-09-29T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - spacetimedb/src/helpers/measurement.ts
  - spacetimedb/src/helpers/measurement_results.ts
  - spacetimedb/src/helpers/measurement.test.ts
  - spacetimedb/src/helpers/measurement.results.test.ts
findings:
  critical: 2
  warning: 7
  info: 5
  total: 14
status: issues_found
---

# Phase 39: Code Review Report

**Reviewed:** 2026-09-29
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

The four helpers are pure and mostly well tested; `vitest run src/helpers/measurement` passes (2 files, 188 tests) against both recorded results files (`39-spike-results.json`, `39-maincloud-results.json`, both git-tracked). The problems are the following.

- The `thresholds` override type cannot express any real override.
- The recorded-file tests couple a frozen artifact to live code and can silently stop testing anything.
- `validateResults` can throw instead of returning problems.
- Redaction can leave residue.
- `measuredNoiseDriftMs` uses a different baseline filter than the gate.
- With the harness deleted, most exports have no production consumer.

## Critical Issues

### CR-01: `thresholds` override type is `Partial<typeof GATE_DEFAULTS>` on an `as const` object, so it only accepts the default literals

**File:** `spacetimedb/src/helpers/measurement.ts:14-23, 71, 86, 161` (also `measurement_results.ts:235`)
**Issue:** `GATE_DEFAULTS` is declared `as const`, so `typeof GATE_DEFAULTS` has literal types (`noiseFloorMs: 0`, `dispatchP95Ms: 250`, ...). `Partial<typeof GATE_DEFAULTS>` therefore accepts only `0` for `noiseFloorMs`, only `250` for `dispatchP95Ms`, and so on. `GateResult.thresholds` has the same problem: it is typed as literals but holds merged values, and the `as typeof GATE_DEFAULTS` cast at line 161 hides it. `tsc --noEmit -p spacetimedb` reports 10 errors on these files, including TS2322 "Type '25' is not assignable to type '0'" and "'400' is not assignable to '250'" (`measurement.test.ts:387,394`; `measurement.results.test.ts:148,335,658,815`). The floor-adjusted verdict, the module's core feature, only compiles today because vitest does not typecheck. Any future typechecked consumer cannot call `evaluateGate` or `gateInputFromResults` with `noiseFloorMs: 25`.
**Fix:**
```ts
export type GateThresholds = { [K in keyof typeof GATE_DEFAULTS]: number };
export const GATE_DEFAULTS: GateThresholds = { ... };   // drop `as const`, or use `satisfies`
// GateInput.thresholds?: Partial<GateThresholds>; GateResult.thresholds: GateThresholds;
```
Then remove the `as typeof GATE_DEFAULTS` cast.

### CR-02: Recorded-results suites can vanish silently, and verdict reproduction is coupled to live code

**File:** `spacetimedb/src/helpers/measurement.results.test.ts:756-819`
**Issue:** Two related problems make these tests unreliable in future phases.
1. `locateRecordedResults()` scans `.planning/phases/39-*`. If the phase is archived (`gsd-cleanup` moves completed-milestone phase dirs) or renamed, it returns `[]`, `describe.runIf(false)` skips, and the suite stays green while proving nothing. The "skips until a file exists" design has no floor. Nothing asserts that the two known files exist, and `39-SPIKE-RECORD.md` claims both verdicts are reproduced by this test. A `39-*` plain file in `phases/` would also make `readdirSync(join(phasesDir, dir))` throw ENOTDIR at module load and take out all 188 tests.
2. "reproduces the recorded strict/floor-adjusted verdict" recomputes with the current `gateInputFromResults` / `evaluateGate`. Any legitimate future change to `GATE_DEFAULTS`, `minInFlightForLevel`, `observedServerCap` filtering or the noise-floor formula turns these into failures for a decided, frozen spike (the maincloud file's verdict is `go` and the local file's is `incomplete`, with `observedServerCap` 4 vs 8). The mitigation is a maintenance trap. Note the local file's verdict is `incomplete`, which has weak discriminating power.
**Fix:** Pin the historical contract and assert the files exist.
```ts
it('has the two known recorded files', () => {
  expect(recordedFiles.map(f => f.name)).toEqual(expect.arrayContaining(['39-spike-results.json','39-maincloud-results.json']));
});
```
Filter `readdirSync(..., { withFileTypes: true })` to directories. Snapshot the thresholds used at decision time (freeze the values in the test or a `39-gate-v1` constant) rather than importing live defaults, or drop the reproduction tests now that the decision is recorded.

## Warnings

### WR-01: `validateResults` can throw instead of returning problems

**File:** `spacetimedb/src/helpers/measurement_results.ts:454-460`
**Issue:** After `samples()` records an invalid element as a problem, the full-profile cell check still runs `cells.filter((c) => c.route?.startsWith(family))`. A `null` element in `structured.cells` throws `TypeError` (`c.route` on null). A non-string `route` throws `startsWith is not a function`. The gate branch at line 449 guards with `c?.route`, but this one does not. The validator's contract is "returns a list of problems".
**Fix:** `cells.filter((c) => isObj(c) && typeof c.route === 'string' && c.route.startsWith(family))`, or skip the cell check when `samples()` already reported invalid elements.

### WR-02: Explicit `undefined`/`NaN` in `thresholds` silently disables checks

**File:** `spacetimedb/src/helpers/measurement.ts:161`
**Issue:** `{ ...GATE_DEFAULTS, ...thresholds }` lets `{ minReliabilityCalls: undefined }` overwrite the default. `calls < undefined` is `false`, so the completeness check passes and the gate can return `go` on thin data. This defeats the "thin data never yields go" guarantee. `NaN` behaves the same way.
**Fix:** Validate merged thresholds (`Number.isFinite` for every key) and throw `RangeError`, or merge only defined keys.

### WR-03: `redactSecrets` leaves residue when needles overlap

**File:** `spacetimedb/src/helpers/measurement.ts:390-396`
**Issue:** Needles are replaced in the supplied order. If a shorter needle is a substring of a longer one (for example a key and a prefix or suffix fragment of it) and comes first, the longer one no longer matches. The remainder of the secret is left in the output around a `[REDACTED]` marker. This is a secret-leak defect in a guard function.
**Fix:** Sort usable needles by length descending (and de-duplicate) before replacing. Better, build one alternation regex from all escaped needles and the key pattern, and run a single pass.

### WR-04: `measuredNoiseDriftMs` filters baselines differently from the gate

**File:** `spacetimedb/src/helpers/measurement_results.ts:299-301` vs `252`
**Issue:** The gate baseline uses only samples with `inFlight === 0`. The drift calculation passes `all = () => true`, so any stray non-zero-`inFlight` sample in `baseline` or `baseline2` inflates the drift and hence `noiseFloorMs = max(25, drift)`. The floor-adjusted verdict is then computed against a baseline the gate never used. The existing "baseline uses only samples with inFlight 0" test does not cover this path.
**Fix:** Use `(n) => n === 0` in `measuredNoiseDriftMs` (share one `baselineKeep` predicate), and add a test that pushes an `inFlight: 3` outlier into `baseline2`.

### WR-05: A level can pass "go" without the server ever reaching `goMinInFlight`

**File:** `spacetimedb/src/helpers/measurement.ts:190, 273-274`; `measurement_results.ts:258-267`
**Issue:** `evaluateGate` decides completeness and `go` from the nominal `inFlight` (8). `effectiveInFlight` is documented as informational and "not read" by the gate. With a server cap of 4 (recorded in the local file), a "level 8" run yields `go` although the module never ran more than 4 procedures at once. The `goMinInFlight = 6` requirement is therefore satisfied vacuously. The strictness is reduced silently through filtering (`tickMin` derived from the observed cap), and the cap is derived from the same tick samples it then filters, so one outlier tick raises it and tightens the filter.
**Fix:** Have `evaluateGate` require `effectiveInFlight >= goMinInFlight` for the `go` level when it is present, or emit a flag (for example `server_cap_below_go_level`) so the verdict cannot read as a clean `go`.

### WR-06: `settleCostMicroUsd` under-counts billed spend and ignores `status`

**File:** `spacetimedb/src/helpers/measurement.ts:358-367`
**Issue:** A non-threw HTTP 200 whose usage failed to parse (`usage: null`) settles to 0, although it was billed. The reservation is discarded, contradicting the "never under-count" stance taken for thrown fetches. `status` is accepted but never read (dead parameter). Timeouts and 5xx after partial processing are also treated as free.
**Fix:** Keep `reservedMicroUsd` when `status === 200 || status === null` and usage is null. Drop `status` from the signature or use it.

### WR-07: Verdict-less recorded file passes as "partial"; reproduction tests pass vacuously

**File:** `spacetimedb/src/helpers/measurement.results.test.ts:797, 805, 812`
**Issue:** `final: doc.verdict !== undefined` means a truncated or half-written results file (verdict block missing) is validated leniently and passes. The two reproduction tests `return` early when `doc.verdict` is missing, so they pass without asserting anything. Deleting the `verdict` key from a recorded file turns four assertions into no-ops.
**Fix:** For files named in the record, require `doc.verdict` (`expect(doc.verdict).toBeDefined()`), and use `it.skipIf(!doc.verdict)` if partial files are a supported case.

## Info

### IN-01: Helpers are now orphaned production code

**File:** `spacetimedb/src/helpers/measurement.ts` (`summarize`, `classifyFailure`, `estimateCostMicroUsd`, `reserveCostMicroUsd`, `settleCostMicroUsd`, `redactSecrets`); `measurement_results.ts` (`floorAdjustedNoiseFloorMs`, `levelLabels`, `validateResults`)
**Issue:** After the spike harness (`scripts/spike/*`) was deleted, nothing under `spacetimedb/src` or elsewhere imports these modules; only the two test files do. The header comment of `measurement.ts` ("so plain Node scripts can import this file directly through built-in type stripping") describes consumers that no longer exist. The cost/secret/classification helpers are exercised only by their own tests. They sit in the SpacetimeDB module's source tree, where `tsconfig` includes `./**/*`, so they and their tests (with a `node:fs` import) are typechecked as module code.
**Fix:** Either move them with the results tests under `.planning/` or `scripts/` so the module tree stays clean, or trim the unused exports. Update the stale header comment.

### IN-02: Test files break the module's typecheck

**File:** `spacetimedb/src/helpers/measurement.results.test.ts:2-4, 763`
**Issue:** `node:fs`, `node:path` and `node:url` have no types (`@types/node` is not installed for this project), which causes TS2591 plus an implicit-any at 763. This adds to the CR-01 errors. It only matters if anyone runs `tsc` on the module.
**Fix:** Add `@types/node` as a devDependency, or exclude `**/*.test.ts` from `tsconfig`.

### IN-03: Magic numbers duplicate gate thresholds

**File:** `spacetimedb/src/helpers/measurement_results.ts:319-329, 366-440, 493`; `floorAdjustedNoiseFloorMs` (25); `measurement.test.ts`
**Issue:** The validator hard-codes 30 (reliability), 50 (dispatch), 10, 20, 3 and levels `[8,4,2]`, duplicating `GATE_DEFAULTS.minReliabilityCalls` / `minDispatchSamples`. The 25 ms floor also appears in the tests. Changing a gate default leaves the validator inconsistent.
**Fix:** Import `GATE_DEFAULTS` and define named constants (`NOISE_FLOOR_MIN_MS = 25`).

### IN-04: Duplicated cap/min-in-flight logic; unhandled duplicate levels

**File:** `spacetimedb/src/helpers/measurement_results.ts:191-209` vs `258-267`; `measurement.ts:230-247`
**Issue:** `levelLabels` and the `loads` mapping in `gateInputFromResults` recompute `cap`, `effective`, `pingMin`, `tickMin` separately and can drift apart. In `evaluateGate`, two loads with the same `inFlight` overwrite each other in `levelPass` (last wins) while both emit checks.
**Fix:** Have `levelLabels` and `gateInputFromResults` share one helper. Reject or merge duplicate `inFlight` levels.

### IN-05: Test quality nits

**File:** `spacetimedb/src/helpers/measurement.test.ts:24-33`; `measurement.results.test.ts:677-678, 283`
**Issue:**
- The "seeded LCG" computes `s * 1103515245` above 2^53, so low bits are lost and the shuffle is weak (still deterministic, so the tests pass).
- "a full fixture is also valid under the gate profile" opens with an assertion that has nothing to do with the gate profile.
- The `gateInputFromResults(doc).dispatch.samples` assertion at line 283 repeats line 280.
- `classifyFailure` maps 2xx other than 200 (201, 204) and 3xx to `platform` with no test or doc note.
**Fix:** Use `Math.imul`, or a 32-bit LCG via `>>> 0`, for the shuffle. Remove the redundant assertions. Document or test the non-200 2xx behavior.

---

_Reviewed: 2026-09-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
