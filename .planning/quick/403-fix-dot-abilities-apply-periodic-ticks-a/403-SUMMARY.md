---
phase: quick-403
plan: 01
subsystem: combat
tags: [dot, hot, combat, periodic-effects, bigint]
dependency_graph:
  requires: []
  provides: [working-dot-effects, dot-cast-log-messages]
  affects: [resolveAbility, tickEffectsForRound]
tech_stack:
  added: []
  patterns: [bigint-floor-guard, tdd]
key_files:
  created: []
  modified:
    - spacetimedb/src/helpers/combat.ts
    - spacetimedb/src/helpers/combat.test.ts
decisions:
  - "Apply dotPerTick/hotPerTick floor of 1n when total > 0n rather than scaling duration down -- simpler fix that matches the intent"
  - "tickEffectsForRound enemy DoT expiry logging already existed at lines 2603-2610 -- no change needed for Task 2"
metrics:
  duration: "~5 minutes"
  completed: "2026-03-10T17:56:57Z"
  tasks_completed: 2
  files_modified: 2
---

# Phase quick-403 Plan 01: Fix DoT Abilities Apply Periodic Ticks Summary

**One-liner:** Bigint floor guard ensures DoT/HoT effects apply with minimum 1n per-tick magnitude even when ability power is less than duration.

## What Was Built

Fixed a bigint integer division bug in `resolveAbility` where `dotPerTick = dotTotal / duration` rounded to `0n` for low-power abilities (e.g., "Rot Bloom" with power=6, duration=9 → dotTotal=3, 3/9=0n). The `if (dotPerTick > 0n)` guard then skipped effect insertion entirely, so no DoT was ever applied.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix DoT/HoT per-tick floor and improve log messages | 29cf266 | combat.ts, combat.test.ts |
| 2 | Verify tickEffectsForRound DoT tick logging (no change needed) | — | — |

## Changes Made

### spacetimedb/src/helpers/combat.ts

**DoT handler (line ~572):** Changed `const dotPerTick` to `let dotPerTick` and added:
```typescript
if (dotPerTick < 1n && dotTotal > 0n) dotPerTick = 1n;
```

**DoT cast log messages:** Updated player DoT cast log from:
> "Your {ability} hits {enemy} for {dealt} damage."

To:
> "Your {ability} hits {enemy} for {dealt} damage and applies a damage-over-time effect."

Same update applied to the group log.

**HoT handler (line ~609):** Changed `const hotPerTick` to `let hotPerTick` and added:
```typescript
if (hotPerTick < 1n && hotTotal > 0n) hotPerTick = 1n;
```

### spacetimedb/src/helpers/combat.test.ts

Added `describe('resolveAbility dot handler - per-tick floor')` with 4 tests:
- `applies DoT effect even with low power (power=2, duration=9)` — core regression guard
- `applies correct DoT magnitude with high power (value1=50, duration=9)`
- `DoT cast log message mentions DoT being applied`
- `applies HoT effect even with low power (value1=2, duration=9)`

## Deviations from Plan

None — plan executed exactly as written. Task 2 confirmed no code change was needed since `tickEffectsForRound` already logs DoT expiry to all participants at lines 2603-2610.

## Verification

- All 59 combat tests pass
- Local publish succeeds: `spacetime publish uwr -p spacetimedb`

## Self-Check

- [x] spacetimedb/src/helpers/combat.ts modified (dotPerTick floor + log messages)
- [x] spacetimedb/src/helpers/combat.test.ts modified (4 new tests)
- [x] Commit 29cf266 exists
- [x] 59/59 tests pass
