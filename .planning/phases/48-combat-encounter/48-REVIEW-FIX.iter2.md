---
phase: 48-combat-encounter
fixed_at: 2026-10-06T00:00:00Z
review_path: .planning/phases/48-combat-encounter/48-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 48: Code Review Fix Report

**Fixed at:** 2026-10-06
**Source review:** .planning/phases/48-combat-encounter/48-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (WR-01 to WR-04; Info items out of scope)
- Fixed: 4
- Skipped: 0

Gate after all fixes: vitest 95 files, 1877 tests pass (1864 before, 13 added); `vue-tsc -b` clean; `pnpm build` clean.

## Fixed Issues

### WR-01: Wind-up snapshot is taken before the rows land

**Files modified:** `src/net/bindTable.ts`, `src/net/bindTable.test.ts`, `src/combat/combatFeed.test.ts`
**Commit:** 8b539a26
**Applied fix:** `bindTable.onApplied` now calls `refresh()` before `applied.value = true`. Tests: a bindTable test with a sync watcher on `applied` that must see the snapshot rows, and two `combatFeed` tests that wire the real `bindTable` to a fake connection using the SDK ordering (cache updated, applied emitted, then row callbacks). All three fail with the old order. No existing Phase 45/47 `bindTable` test broke and no assertion was changed. The existing `combatFeed` wind-up tests set `casts` before `castsApplied`, which is the state that results after this fix, so they stay valid and were left as they are; the new tests cover the real ordering.

### WR-02: A refused or failed target request leaves lastRequested and the status line wrong

**Files modified:** `src/combat/useCombatController.ts`, `src/combat/useCombatController.test.ts`, `src/frame/AppFrame.screens.test.ts`
**Commits:** cd48fd35 (code and controller tests), dffb0921 (AppFrame test)
**Applied fix:** `targetStatus` is now announced only when the character's confirmed `combatTargetEnemyId` (from the subscription) echoes the most recent request, or at once if the confirmed target already is the requested one. `lastRequested` stays as the in-flight cycle base, because rapid Tab presses must still advance before the echo. A rejected reducer call rolls `lastRequested` back, but only if nothing newer was requested. A refusal that the server writes to the feed (`failCombat`, which resolves normally) names an enemy that is not living in this fight, which `nextTargetId` already ignores, so no extra handling is needed.
**Assertions changed (all assert the new server-confirmed behavior):**
- `useCombatController.test.ts` "requests a living hostile once and sets the status line" (renamed "...when the server echoes it"): status is `''` right after `requestTarget`, and `'Target: Cinderhound'` after the character row echoes target 9n.
- `useCombatController.test.ts` "resets to the player when the fight ends and clears the target memory": added `confirmTarget(fake, 9n)` before the `'Target: Cinderhound'` assertion.
- `AppFrame.screens.test.ts` "renders a hidden status element that carries the target line as text": status is `''` after Tab until the character row echoes target 9n, then the escaped text is asserted.
New tests: immediate announce when already confirmed, no announce without an echo, rollback on rejection, and a newer request surviving an older rejection (the rollback test fails without the rollback).

### WR-03: Combat gating depends on a server-clock estimate sampled only from feed events

**Files modified:** `src/combat/useCombatController.ts`, `src/combat/useCombatController.test.ts`
**Commit:** e1f10230
**Applied fix:** The controller samples `game.clock` from the open round's `startedAtMicros` when a round arrives live: Round 1, or a round number higher than one the controller already saw in the same combat. A later round first seen as a snapshot (mid-fight reload) is not sampled, because its start can be a round old and would bias the estimate. Tests (fake client clock 10 s ahead): a fresh round is not read as expired, the next round re-samples, and a snapshot of a later round does not touch the skew. Both live tests fail without the sample.
**Status note:** fixed, requires human verification (clock logic). Residual limit: after a mid-fight reload on a client clock that is well ahead, the estimate still waits for the next feed event or the next round to be sampled, the same limit as the reviewer's suggested fix.

### WR-04: Spurious ready flash on every cooling slot when combat starts or ends

**Files modified:** `src/hotbar/HotbarRow.vue`, `src/hotbar/HotbarRow.test.ts`
**Commit:** 9bb8d5e7
**Applied fix:** The ready-flash watcher now tracks `inCombat` with the slot snapshot and skips the comparison when the mode differs from the previous pass, so it only rebases. Tests: no flash on combat start (wall-clock 12 s becomes 0 rounds), none on combat end, and a real completion after a mode switch still flashes. The first two fail without the mode check.

---

_Fixed: 2026-10-06_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
