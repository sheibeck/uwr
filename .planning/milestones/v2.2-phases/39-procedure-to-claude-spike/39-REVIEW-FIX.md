---
phase: 39-procedure-to-claude-spike
fixed_at: 2026-09-29T21:00:00Z
review_path: .planning/phases/39-procedure-to-claude-spike/39-REVIEW.md
iteration: 1
findings_in_scope: 9
fixed: 9
skipped: 0
status: all_fixed
---

# Phase 39: Code Review Fix Report

**Fixed at:** 2026-09-29
**Source review:** .planning/phases/39-procedure-to-claude-spike/39-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 9 (2 critical, 7 warning; Info findings out of scope)
- Fixed: 9
- Skipped: 0

All commits are on the temp branch `gsd-reviewfix/39-1106337`, NOT yet on `master`. `master` advanced during the run (commits 18ff0990 and 34857747, planning docs only), so the `--ff-only` fast-forward was refused and the temp branch was preserved as the protocol requires. To land the fixes: `git rebase master gsd-reviewfix/39-1106337 && git merge --ff-only gsd-reviewfix/39-1106337 && git branch -d gsd-reviewfix/39-1106337` (the two touched trees are disjoint, so no conflicts are expected).

Verification in the isolated worktree: `vitest run src/helpers/measurement` 205 passed (was 188); full `vitest run` in `spacetimedb` 18 files, 683 tests passed (was 666); the forbidden-identifier `git grep` over `spacetimedb/src` is empty; `tsc --noEmit` on the measurement files now shows only the `@types/node` errors (IN-02, out of scope). `pnpm --dir spacetimedb ...` could not be used in the worktree (pnpm dependency status check failed there), so `node_modules/.bin/vitest` was invoked directly against a temporary junction to the main `node_modules`, which was removed before cleanup.

## Fixed Issues

### CR-01: `thresholds` override type accepted only the default literals

**Files modified:** `spacetimedb/src/helpers/measurement.ts`
**Commit:** 6a41eaaa
**Applied fix:** Added a number-typed `GateThresholds` interface, typed `GATE_DEFAULTS` as `Readonly<GateThresholds>` (dropped `as const`), used it for `GateInput.thresholds` (`Partial<GateThresholds>`) and `GateResult.thresholds`, and removed the `as typeof GATE_DEFAULTS` cast. The 7 TS2322 errors on `noiseFloorMs: 25` / `dispatchP95Ms: 400` are gone.

### CR-02: Recorded-results suites could vanish silently and were coupled to live code

**Files modified:** `spacetimedb/src/helpers/measurement.results.test.ts`
**Commit:** b1bbdb9e
**Applied fix:** Reproduction of the recorded verdicts no longer reads `GATE_DEFAULTS`, `minInFlightForLevel`, `observedServerCap`, `gateInputFromResults` or `floorAdjustedNoiseFloorMs`. The test file pins the decision-time thresholds (`DECISION_THRESHOLDS`, asserted equal to the thresholds stored inside both recorded files), the level filter, the server-cap rule and the noise-floor rule (`decisionGateInput`, `decisionNoiseFloorMs`), plus a frozen `RECORDED_DECISIONS` table (local file: incomplete/incomplete, floor 171.7653, cap 4; maincloud file: go/go, floor 25, cap 8). Only the generic pieces (`collectCallSamples`, `percentile`, `evaluateGate`) stay live. Discovery now walks directories only (`withFileTypes`), and a new test fails loudly if either known file is not found. The recorded JSON files were not touched. Reproduction coverage was replaced, not removed (the recorded-file suites grew from 10 to 15 tests).

### WR-01: `validateResults` could throw

**Files modified:** `spacetimedb/src/helpers/measurement_results.ts`, `spacetimedb/src/helpers/measurement.results.test.ts`
**Commit:** 2b910595
**Applied fix:** The full-profile cell check filters to objects with a string `route` before `startsWith`, so null, non-object and non-string-route cells return problems (via `samples()`) or are skipped instead of throwing. Regression test added and confirmed to fail on the old code.

### WR-02: Explicit `undefined`/`NaN` in `thresholds` silently disabled checks

**Files modified:** `spacetimedb/src/helpers/measurement.ts`, `spacetimedb/src/helpers/measurement.test.ts`
**Commit:** b66f8046
**Applied fix:** New `resolveThresholds` merges overrides over defaults: an explicit `undefined` keeps the default; NaN, Infinity or a non-number throws `RangeError`. Tests added.

### WR-03: `redactSecrets` left residue when needles overlap

**Files modified:** `spacetimedb/src/helpers/measurement.ts`, `spacetimedb/src/helpers/measurement.test.ts`
**Commit:** 1dca2781
**Applied fix:** Rewrote `redactSecrets` to locate all key-pattern and needle matches (overlapping occurrences included) against the original text, merge overlapping ranges, and replace once. Order of needles no longer matters. Three regression tests added; two fail on the old implementation.

### WR-04: `measuredNoiseDriftMs` used a different baseline filter than the gate

**Files modified:** `spacetimedb/src/helpers/measurement_results.ts`, `spacetimedb/src/helpers/measurement.results.test.ts`
**Commit:** 2e88e109
**Applied fix:** Introduced a shared `isBaselineSample` (`inFlight === 0`) used by both the gate baseline and the drift calculation. Regression test with 300 loaded outliers added and confirmed to fail on the old code. Both recorded files contain only `inFlight` 0 baseline samples, so their recorded noise floors are unaffected (and the pinned reproduction does not depend on this code).

### WR-05: A level could pass "go" without the server reaching `goMinInFlight`

**Files modified:** `spacetimedb/src/helpers/measurement.ts`, `spacetimedb/src/helpers/measurement.test.ts`
**Commit:** 6bb0c304
**Applied fix:** `evaluateGate` adds the flag `server_cap_below_go_level` when the highest level's `effectiveInFlight` is present and below `goMinInFlight`. The verdict is deliberately unchanged (the reviewer offered the flag as an option): downgrading the verdict would change policy that Plan 39-08 encoded and risk invalidating recorded evidence. Updated the `effectiveInFlight` doc comment. Status: fixed: requires human verification (logic change; confirm a flag-only response is the wanted strictness, or say if `go` should instead become `incomplete` in this case).

### WR-06: `settleCostMicroUsd` under-counted billed spend

**Files modified:** `spacetimedb/src/helpers/measurement.ts`, `spacetimedb/src/helpers/measurement.test.ts`
**Commit:** 3ed0d43e
**Applied fix:** A non-threw response with status 200 or null and no parsed usage now keeps the reservation; other statuses without usage still settle to 0. `status` is now read, so it is no longer a dead parameter. Status: fixed: requires human verification (billing logic). Timeouts and 5xx after partial processing still settle to 0, as the reviewer's fix did not cover them.

### WR-07: Verdict-less recorded file passed as partial; reproduction tests were vacuous

**Files modified:** `spacetimedb/src/helpers/measurement.results.test.ts`
**Commit:** 6a497e03
**Applied fix:** Known recorded files are always validated as final, and a new test requires a `verdict` block that matches the frozen decision table (verdicts, caps, noise floor, observed server cap). The early-return no-ops in the reproduction tests were already removed by CR-02.

## Skipped Issues

None.

---

_Fixed: 2026-09-29_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
