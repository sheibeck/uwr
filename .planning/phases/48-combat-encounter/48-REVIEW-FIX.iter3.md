---
phase: 48-combat-encounter
fixed_at: 2026-10-06T00:00:00Z
review_path: .planning/phases/48-combat-encounter/48-REVIEW.md
iteration: 2
findings_in_scope: 1
fixed: 1
skipped: 0
status: all_fixed
---

# Phase 48: Code Review Fix Report

**Fixed at:** 2026-10-06
**Source review:** .planning/phases/48-combat-encounter/48-REVIEW.md
**Iteration:** 2

**Summary:**
- Findings in scope: 1 (WR-05; Info items out of scope). The iteration-1 findings WR-01 to WR-04 were verified resolved by the re-review.
- Fixed: 1
- Skipped: 0

Gate after the iteration-2 fix: vitest 95 files, 1880 tests pass (1877 before, 3 net added); `vue-tsc -b` clean. The only failures the re-review recorded before the fix, two tests in `spacetimedb/src/helpers/measurement.results.test.ts`, are outside `src` and outside this phase's files, and `--dir src` does not run them.

## Fixed Issues (iteration 2)

### WR-05: A Round 1 snapshot (reload or late join during Round 1) is sampled as if it were live and skews the countdown

**Files modified:** `src/combat/useCombatController.ts`, `src/combat/useCombatController.test.ts`, `src/game/context.ts`, `src/game/gameData.ts`, `src/game/gameData.test.ts`
**Commit:** b45005df
**Status:** fixed: requires human verification (clock logic).
**Applied fix:**
- New `combat.roundsApplied` flag (the shown `combat_round` binding's `applied`), added to `CombatData`, the inert data and `gameData`. It follows the same pattern as `castsApplied`.
- The controller samples the server clock from an open round only when it is live:
  - the round binding has already applied (rows published by the WR-01 ordering before the flag flips, so a snapshot arrives while it is still false), or
  - the controller has seen `combat.active === false` and the row is Round 1, the fresh start of a fight that began while it was watching.
- The old "Round 1 or advanced" rule is removed. A Round 1 snapshot on a controller that starts in combat, a later round first seen as a snapshot, and a late-join snapshot of a later round after the controller saw inactive no longer sample. A new fight's Round 1 that arrives through a keyed-binding promotion (applied is already true) samples, which is correct.

**Tests (`useCombatController.test.ts`, client clock 10 s ahead):**
- Added (the review's test): a controller that starts in combat sees Round 1 that began 5 s ago; `skewMicros` stays 0.
- Added: a late-join snapshot of round 3 after the controller saw combat inactive does not sample.
- Added: a round that arrives after the round binding applied samples, on a controller that started in combat.
- Kept the WR-03 behavior, with the setup adjusted to the new live rule: a fresh live round (fight started while the controller watched) is not read as expired, and the next round re-samples once the round binding has applied. Both tests now start the controller inactive and flip `active`; the re-sample test also sets `roundsApplied` after Round 1, which models the real binding.
- Kept: a later round first seen as a snapshot does not sample.
- `gameData.test.ts`: `roundsApplied` is false and then true with the `Q_ROUNDS_10` binding, and is part of the inert-combat flags check.

**Residual limits:**
- A late joiner that sees Round 1 of a fight begun elsewhere, after the controller had already seen combat inactive and before the round binding applied, is indistinguishable from a fresh fight start and samples. Its age is at most one round, the same bound as before.
- After a mid-fight reload on a client clock that is well ahead, the estimate still waits for the next feed event or the next live round, the limit already noted for WR-03.

## Fixed Issues (iteration 1, carried forward)

Gate after the iteration-1 fixes: vitest 95 files, 1877 tests pass (1864 before, 13 added); `vue-tsc -b` clean; `pnpm build` clean.

### WR-01: Wind-up snapshot is taken before the rows land

**Files modified:** `src/net/bindTable.ts`, `src/net/bindTable.test.ts`, `src/combat/combatFeed.test.ts`
**Commit:** 8b539a26
**Applied fix:** `bindTable.onApplied` now calls `refresh()` before `applied.value = true`. Tests: a bindTable test with a sync watcher on `applied` that must see the snapshot rows, and two `combatFeed` tests that wire the real `bindTable` to a fake connection using the SDK ordering (cache updated, applied emitted, then row callbacks). All three fail with the old order. No existing Phase 45/47 `bindTable` test broke and no assertion was changed. The existing `combatFeed` wind-up tests set `casts` before `castsApplied`, which is the state that results after this fix, so they stay valid and were left as they are.

### WR-02: A refused or failed target request leaves lastRequested and the status line wrong

**Files modified:** `src/combat/useCombatController.ts`, `src/combat/useCombatController.test.ts`, `src/frame/AppFrame.screens.test.ts`
**Commits:** cd48fd35 (code and controller tests), dffb0921 (AppFrame test)
**Applied fix:** `targetStatus` is announced only when the character's confirmed `combatTargetEnemyId` (from the subscription) echoes the most recent request, or at once if the confirmed target already is the requested one. `lastRequested` stays as the in-flight cycle base, because rapid Tab presses must still advance before the echo. A rejected reducer call rolls `lastRequested` back, but only if nothing newer was requested. A refusal that the server writes to the feed (`failCombat`, which resolves normally) names an enemy that is not living in this fight, which `nextTargetId` already ignores, so no extra handling is needed.
**Assertions changed (all assert the new server-confirmed behavior):**
- `useCombatController.test.ts` "requests a living hostile once and sets the status line" (renamed "...when the server echoes it"): status is `''` right after `requestTarget`, and `'Target: Cinderhound'` after the character row echoes target 9n.
- `useCombatController.test.ts` "resets to the player when the fight ends and clears the target memory": added `confirmTarget(fake, 9n)` before the `'Target: Cinderhound'` assertion.
- `AppFrame.screens.test.ts` "renders a hidden status element that carries the target line as text": status is `''` after Tab until the character row echoes target 9n, then the escaped text is asserted.
New tests: immediate announce when already confirmed, no announce without an echo, rollback on rejection, and a newer request surviving an older rejection (the rollback test fails without the rollback).

### WR-03: Combat gating depends on a server-clock estimate sampled only from feed events

**Files modified:** `src/combat/useCombatController.ts`, `src/combat/useCombatController.test.ts`
**Commit:** e1f10230
**Applied fix:** The controller samples `game.clock` from the open round's `startedAtMicros` when a round arrives live (Round 1, or a round number higher than one the controller already saw in the same combat). Tests (fake client clock 10 s ahead): a fresh round is not read as expired, the next round re-samples, and a snapshot of a later round does not touch the skew. Both live tests fail without the sample.
**Status note:** fixed, requires human verification (clock logic). The iteration-2 re-review found that the "Round 1 is always live" part was wrong for a reload or late join during Round 1; that is WR-05 above, which replaces the "Round 1 or advanced" rule.

### WR-04: Spurious ready flash on every cooling slot when combat starts or ends

**Files modified:** `src/hotbar/HotbarRow.vue`, `src/hotbar/HotbarRow.test.ts`
**Commit:** 9bb8d5e7
**Applied fix:** The ready-flash watcher now tracks `inCombat` with the slot snapshot and skips the comparison when the mode differs from the previous pass, so it only rebases. Tests: no flash on combat start (wall-clock 12 s becomes 0 rounds), none on combat end, and a real completion after a mode switch still flashes. The first two fail without the mode check.

---

_Fixed: 2026-10-06_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
