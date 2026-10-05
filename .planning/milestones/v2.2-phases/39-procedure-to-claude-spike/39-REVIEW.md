---
phase: 39-procedure-to-claude-spike
reviewed: 2026-09-29T21:30:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - spacetimedb/src/helpers/measurement.ts
  - spacetimedb/src/helpers/measurement_results.ts
  - spacetimedb/src/helpers/measurement.test.ts
  - spacetimedb/src/helpers/measurement.results.test.ts
findings:
  critical: 0
  warning: 0
  info: 3
  total: 3
status: clean
---

# Phase 39: Code Review Report (iteration 2)

**Reviewed:** 2026-09-29T21:30:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** clean (no critical or warning findings)

## Summary

Re-reviewed the four measurement files after the CR-01, CR-02 and WR-01..WR-07 fixes. Each fix was traced against the current code and holds:

- CR-01: `GateThresholds` is number-typed and used for `GATE_DEFAULTS`, `GateInput.thresholds` and `GateResult.thresholds`. No cast remains.
- CR-02: the recorded-file reproduction pins thresholds, level filter, cap rule and noise-floor rule locally. It reuses only `collectCallSamples`, `percentile` and `evaluateGate`. Discovery is directory-only, and a test fails loudly if either known file is missing.
- WR-01: the full-profile cell check guards `isObj` and `typeof route === 'string'` before `startsWith`.
- WR-02: `resolveThresholds` keeps the default for an explicit `undefined` and throws `RangeError` for non-finite or non-number values.
- WR-03: `redactSecrets` collects all key-pattern and needle ranges against the original text and merges overlaps. I traced the loop for nested, partially overlapping and adjacent ranges. There is no residue and no off-by-one.
- WR-04: `isBaselineSample` is shared by the gate baseline and the drift calculation.
- WR-05 and WR-06: implemented as accepted. The flag logic and the settle branches are correct.
- WR-07: known recorded files are validated as final, and their verdict block is pinned.

`vitest run src/helpers/measurement` passes locally (2 files, 205 tests). The two recorded JSONs each contain one level per `inFlight` (8, 4, 2), so the notes below do not affect the frozen evidence.

## Structural Findings (fallow)

Not provided.

## Narrative Findings (AI reviewer)

### Info

### IN-01: Duplicate `inFlight` levels are silently collapsed by the gate

**File:** `spacetimedb/src/helpers/measurement.ts:260-276` (and `spacetimedb/src/helpers/measurement_results.ts:498-502`)
**Issue:** `levelPass` is a `Map` keyed by `inFlight`. If a results document holds two load levels with the same `inFlight` (for example a re-run), the later one overwrites the earlier one. `highest = loads[0]` and the `go` decision then read whichever entry won, and the check list carries duplicate `ping_p95@N` names. `validateResults` only checks that a level with each required `inFlight` exists, so it does not catch this. The recorded files are unaffected.
**Fix:** Reject duplicates in `validateResults`, for example:
```ts
const seen = new Set<unknown>();
for (const l of load.levels) {
  if (isObj(l)) {
    if (seen.has(l.inFlight)) problems.push(`load.levels has duplicate inFlight ${String(l.inFlight)}`);
    seen.add(l.inFlight);
  }
}
```

### IN-02: `settleCostMicroUsd` cannot tell a cap-blocked call from a billed one with no status

**File:** `spacetimedb/src/helpers/measurement.ts:396-406`
**Issue:** With `threw: false`, `status: null` and `usage: null`, the function keeps the reservation. That is correct for a missing result row (billing unknown). A call blocked locally by the spend cap also has `status: null` and `usage: null` but was never sent, so it would be charged the full reservation if a caller settles it. `classifyFailure` has a `capBlocked` input for this case, but `settleCostMicroUsd` has none. No caller exists in the repo today, so this is only a contract gap.
**Fix:** Either document that cap-blocked calls must not be settled, or add `capBlocked?: boolean` to the parameter object and return 0 for it.

### IN-03: Latency-window content is not validated, so `gateInputFromResults` can throw on malformed samples

**File:** `spacetimedb/src/helpers/measurement_results.ts:214-227`, `:156-164`, `:489-504`
**Issue:** `validateResults` checks that `load.baseline` and `load.baseline2` are objects and that `load.levels` is an array. It does not check the element shape of `pingMs`, `tick` or `levels`. A null level, a null sample, or a non-numeric `ms` or `lateMs` makes `observedServerCap`, `windowStats` or `percentile` throw instead of being reported as a problem. This is the same class of issue as WR-01, in a different function. It only affects hand-edited or truncated files.
**Fix:** In `validateResults`, check that each `load.levels[i]` is an object whose `window.pingMs` and `window.tick` entries have numeric `ms` or `lateMs` and `inFlight`.

---

_Reviewed: 2026-09-29T21:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
