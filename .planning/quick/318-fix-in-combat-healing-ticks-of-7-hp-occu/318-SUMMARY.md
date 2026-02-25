---
phase: quick-318
plan: 01
subsystem: combat-regen
tags: [bugfix, regen, combat]
dependency-graph:
  requires: []
  provides: [consistent-8s-combat-regen]
  affects: [spacetimedb/src/reducers/combat.ts]
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified: []
decisions:
  - "No code changes needed — halfTick mechanism was already removed in commit 7fcb114 (quick-313)"
metrics:
  duration: "26s"
  completed: "2026-02-25T04:10:15Z"
---

# Quick 318: Fix In-Combat Healing Ticks Summary

Already fixed — halfTick skip mechanism removed in prior commit 7fcb114 (quick-313 snake_case rename).

## One-liner

In-combat regen already ticks every 8 seconds; halfTick skip was removed during quick-313 refactor.

## What Was Done

### Task 1: Remove halfTick skip from regen_health reducer

**Status:** Already complete (no changes needed)

The plan targeted three lines:
1. `const tickIndex = ctx.timestamp.microsSinceUnixEpoch / REGEN_TICK_MICROS;`
2. `const halfTick = tickIndex % 2n === 0n;`
3. `if (inCombat && !halfTick) continue;`

These were already removed from the codebase. Git history confirms:
- Present in commit `834d986` (quick-307, v2 migration)
- Removed in commit `7fcb114` (quick-313, snake_case rename refactor)

### Verification

- `grep -n "halfTick\|tickIndex" combat.ts` returns zero matches
- `HP_REGEN_IN = 2n` is intact at line 1300
- `inCombat` detection logic is intact at line 1313
- Food and racial bonus stacking is intact (lines 1329-1346)
- Out-of-combat regen logic is untouched

## Deviations from Plan

None - plan executed exactly as written (fix was already in place).

## Commits

No commits created — no code changes were necessary.

## Self-Check: PASSED

- halfTick and tickIndex: confirmed absent from combat.ts
- HP_REGEN_IN = 2n: confirmed present
- Food/racial bonus stacking: confirmed intact
- Out-of-combat regen: confirmed untouched
