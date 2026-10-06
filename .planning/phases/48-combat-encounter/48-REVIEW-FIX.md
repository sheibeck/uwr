---
phase: 48-combat-encounter
fixed_at: 2026-10-06T00:00:00Z
review_path: .planning/phases/48-combat-encounter/48-REVIEW.md
iteration: 3
findings_in_scope: 1
fixed: 1
skipped: 0
status: all_fixed
---

# Phase 48: Code Review Fix Report

**Fixed at:** 2026-10-06
**Source review:** .planning/phases/48-combat-encounter/48-REVIEW.md
**Iteration:** 3

**Summary:**
- Findings in scope: 1 (WR-06; Info items out of scope). The iteration-1 findings WR-01 to WR-04 stay resolved. WR-05 was found only partly resolved by the iteration-3 re-review, and WR-06 is its residual.
- Fixed: 1
- Skipped: 0

Gate after the iteration-3 fix: vitest 95 files, 1882 tests pass (1880 before, 2 net added); `vue-tsc -b` clean; `pnpm build` clean. The two failures the earlier re-reviews recorded in `spacetimedb/src/helpers/measurement.results.test.ts` are outside `src` and outside this phase's files, and `--dir src` does not run them.

## Fixed Issues (iteration 3)

### WR-06: `seenInactive` is true on every reload, so a Round 1 snapshot is still sampled

**Files modified:** `src/combat/useCombatController.ts`, `src/combat/useCombatController.test.ts`, `src/game/context.ts`, `src/game/gameData.ts`, `src/game/gameData.test.ts`
**Commit:** d2d74a7b
**Status:** fixed: requires human verification (clock logic).
**Applied fix:**
- New `combat.participantApplied` flag: the own-participant binding's `applied` (`ownParticipant.current.value?.applied.value ?? false`), added to `CombatData`, the inert data (`constant(false)`) and `gameData`.
- The controller now latches `seenInactive` only when `participantApplied && !active` holds, with an immediate sync watcher. That state means the server confirmed the character is not in a fight. A reload, reconnect or character switch never passes through it, because `active` is false there only because the participant snapshot has not arrived and `participantApplied` is still false. A fight that starts while the controller watches does pass through it.
- The sampling rule from WR-05 is otherwise unchanged: a round samples when the round binding has applied, or when `seenInactive` holds and the row is Round 1.

**Tests (`useCombatController.test.ts`, client clock 10 s ahead):**
- Replaced the misleading "does not sample a Round 1 snapshot delivered to a controller that starts in combat". The new test builds the controller with `active = false` and `participantApplied = false` (the production reload order), then flips `active`/`participantApplied` as the participant snapshot lands and delivers a Round 1 snapshot that started 5 s ago. `skewMicros` stays 0 and the round reads as expired. It fails with the old `combat.active` watcher.
- Added the positive case: `participantApplied = true` and `active = false`, then the fight starts and a live Round 1 arrives. The clock is sampled and the round is not read as expired.
- The fresh-start tests (WR-03 "does not read a fresh fight round as expired", "samples the next round when it arrives after the round binding applied") and the "late-join snapshot of round 3 after the controller saw combat inactive" test now set `participantApplied = true` while `active` is false, modelling a server-confirmed idle controller. Their assertions are unchanged.
- All other WR-01 to WR-05 tests are unchanged and green.
- `gameData.test.ts`: new test that `participantApplied` is false before the own-participant binding applies, true once it applies with empty rows (with `active` false), and stays true when the row arrives. `participantApplied` is also part of the inert-combat flags check.

**Residual limits (corrected):**
- A Round 1 snapshot is no longer sampled on a reload, reconnect into a new controller, or character selection. The earlier note ("a late joiner that sees Round 1 of a fight begun elsewhere") understated the problem before this fix and no longer describes the remaining case.
- What remains: a character that is idle with the server confirming it, and is then pulled into an already-running Round 1 fight (for example joined to a group fight that began a moment earlier), is indistinguishable from a fight that started fresh. Its Round 1 snapshot samples. The age is at most one round (`ROUND_TIMER_MICROS`, 10 s), the same bound as before, and the next live round re-samples it.
- After a mid-fight reload on a client clock that is well ahead, the estimate still waits for the next feed event or the next live round, the limit already noted for WR-03.

## Fixed Issues (iteration 2, carried forward)

### WR-05: A Round 1 snapshot (reload or late join during Round 1) is sampled as if it were live and skews the countdown

**Files modified:** `src/combat/useCombatController.ts`, `src/combat/useCombatController.test.ts`, `src/game/context.ts`, `src/game/gameData.ts`, `src/game/gameData.test.ts`
**Commit:** b45005df
**Status:** fixed: requires human verification (clock logic). The iteration-3 re-review found it only partly resolved: the "seen inactive" discriminator was true on every reload. WR-06 above completes it.
**Applied fix:**
- New `combat.roundsApplied` flag (the shown `combat_round` binding's `applied`), added to `CombatData`, the inert data and `gameData`, following the `castsApplied` pattern.
- The controller samples the server clock from an open round only when it is live: the round binding has already applied (rows are published by the WR-01 ordering before the flag flips, so a snapshot arrives while it is still false), or the controller has seen the character idle and the row is Round 1. The "Round 1 or advanced" rule was removed.
- Tests: later-round snapshot after the controller saw inactive does not sample; a round that arrives after the round binding applied samples; a later round first seen as a snapshot does not sample; WR-03 tests adjusted to the live rule; `gameData.test.ts` covers `roundsApplied`.

## Fixed Issues (iteration 1, carried forward)

Gate after the iteration-1 fixes: vitest 95 files, 1877 tests pass (1864 before, 13 added); `vue-tsc -b` clean; `pnpm build` clean.

### WR-01: Wind-up snapshot is taken before the rows land

**Files modified:** `src/net/bindTable.ts`, `src/net/bindTable.test.ts`, `src/combat/combatFeed.test.ts`
**Commit:** 8b539a26
**Applied fix:** `bindTable.onApplied` now calls `refresh()` before `applied.value = true`. Tests: a bindTable test with a sync watcher on `applied` that must see the snapshot rows, and two `combatFeed` tests that wire the real `bindTable` to a fake connection using the SDK ordering (cache updated, applied emitted, then row callbacks). All three fail with the old order. No existing Phase 45/47 `bindTable` test broke and no assertion was changed.

### WR-02: A refused or failed target request leaves lastRequested and the status line wrong

**Files modified:** `src/combat/useCombatController.ts`, `src/combat/useCombatController.test.ts`, `src/frame/AppFrame.screens.test.ts`
**Commits:** cd48fd35 (code and controller tests), dffb0921 (AppFrame test)
**Applied fix:** `targetStatus` is announced only when the character's confirmed `combatTargetEnemyId` (from the subscription) echoes the most recent request, or at once if the confirmed target already is the requested one. `lastRequested` stays as the in-flight cycle base, because rapid Tab presses must still advance before the echo. A rejected reducer call rolls `lastRequested` back, but only if nothing newer was requested. A refusal the server writes to the feed (`failCombat`, which resolves normally) names an enemy that is not living in this fight, which `nextTargetId` already ignores.
**Assertions changed (all assert the new server-confirmed behavior):**
- `useCombatController.test.ts` "requests a living hostile once and sets the status line" (renamed "...when the server echoes it"): status is `''` right after `requestTarget`, and `'Target: Cinderhound'` after the character row echoes target 9n.
- `useCombatController.test.ts` "resets to the player when the fight ends and clears the target memory": added `confirmTarget(fake, 9n)` before the `'Target: Cinderhound'` assertion.
- `AppFrame.screens.test.ts` "renders a hidden status element that carries the target line as text": status is `''` after Tab until the character row echoes target 9n, then the escaped text is asserted.
New tests: immediate announce when already confirmed, no announce without an echo, rollback on rejection, and a newer request surviving an older rejection.

### WR-03: Combat gating depends on a server-clock estimate sampled only from feed events

**Files modified:** `src/combat/useCombatController.ts`, `src/combat/useCombatController.test.ts`
**Commit:** e1f10230
**Applied fix:** The controller samples `game.clock` from the open round's `startedAtMicros` when a round arrives live. Tests (fake client clock 10 s ahead): a fresh round is not read as expired, the next round re-samples, and a snapshot of a later round does not touch the skew.
**Status note:** fixed, requires human verification (clock logic). The "Round 1 is always live" part was wrong for a reload or late join; WR-05 replaced that rule and WR-06 completes it.

### WR-04: Spurious ready flash on every cooling slot when combat starts or ends

**Files modified:** `src/hotbar/HotbarRow.vue`, `src/hotbar/HotbarRow.test.ts`
**Commit:** 9bb8d5e7
**Applied fix:** The ready-flash watcher now tracks `inCombat` with the slot snapshot and skips the comparison when the mode differs from the previous pass, so it only rebases. Tests: no flash on combat start, none on combat end, and a real completion after a mode switch still flashes. The first two fail without the mode check.

---

_Fixed: 2026-10-06_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 3_
