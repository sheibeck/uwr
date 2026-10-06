---
phase: 48-combat-encounter
reviewed: 2026-10-06T00:00:00Z
depth: standard
iteration: 2
files_reviewed: 8
files_reviewed_list:
  - src/net/bindTable.ts
  - src/net/bindTable.test.ts
  - src/combat/combatFeed.test.ts
  - src/combat/useCombatController.ts
  - src/combat/useCombatController.test.ts
  - src/frame/AppFrame.screens.test.ts
  - src/hotbar/HotbarRow.vue
  - src/hotbar/HotbarRow.test.ts
findings:
  critical: 0
  warning: 1
  info: 5
  total: 6
status: issues_found
---

# Phase 48: Code Review Report (iteration 2)

**Reviewed:** 2026-10-06
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

This is the re-review after the fix commits 8b539a26 (WR-01), cd48fd35 and dffb0921 (WR-02), e1f10230 (WR-03) and 9bb8d5e7 (WR-04). I read the eight changed files in full and also traced `src/net/bindTable.ts` consumers (`game/keyedBinding.ts`, `game/gameData.ts`, `session/useSession.ts`, `session/deriveScreen.ts`, `combat/combatFeed.ts`, `console/useConsole.ts`), `game/serverClock.ts` and `combat/roundClock.ts`. `vitest run src` ends with 5649 of 5651 tests passing. The two failures are both in `spacetimedb/src/helpers/measurement.results.test.ts` ("no recorded results files found under .planning/phases/39-*"). They do not involve any file in this phase and are not caused by the fixes.

Verdicts:

- **WR-01 (bindTable ordering): resolved, no regression found.** `refresh()` now runs before `applied.value = true`. Consumers of `applied`, checked one by one:
  - `combatFeed` casts watcher: `refresh()` fires it with `applied` still false, which only resets `snapshotTaken`. The `applied` flip then records the full snapshot. The SDK's later per-row insert callbacks replace the rows array again, but every id is already in `seenCasts`, so nothing is announced.
  - `keyedBinding` promote-on-applied: it now promotes a binding whose rows are already published. Previously the shown rows could be empty for one tick after promotion, so this is strictly better.
  - `useSession` (login watcher, `playerLoaded`, `charactersApplied`) and `deriveScreen`: the watchers also depend on `player` and on the rows, so they converge to the same state in one pass instead of two. No code relied on seeing `applied === true` with empty rows.
  - Reconnect: `detach()` still keeps rows and `applied`, and the new subscription still replaces rows on apply. The ordering change does not touch this path, and the bindTable and session reconnect suites pass.
  - A throwing `options.filter` inside `refresh()` would now leave `applied` false, where it used to leave it true. The filters in `gameData.ts` are pure predicates, so this is theoretical.
- **WR-02 (target status and rollback): resolved.**
  - Rapid Tab: each press advances from `lastRequested` (A, then B, then C). A rejection of an older request does not roll back because `lastRequested !== enemyId`. A rejection of the newest request resets the base to the confirmed target. The announcement fires only when the server echo equals the latest request, so intermediate echoes (A, B) are not announced and C is.
  - A request that matches the already-confirmed target announces at once.
  - The tests cover rollback, a newer request surviving an older rejection, no announce without an echo, and an immediate announce.
  - The transient case "request Y, then request the confirmed X again" briefly shows X while the server echoes Y first. It ends on the correct value once the final echo lands. I do not count it as a defect.
- **WR-04 (ready flash on a mode switch): resolved.** The watcher getter returns `{ mode, entries }`. The callback returns early when `previous.mode !== next.mode`, so the first pass after a switch only rebases. The three new tests cover combat start, combat end, and a real completion after a switch.
- **WR-03 (clock sampling): partly resolved.** A fresh live round now samples the clock, which fixes the ahead-clock lockout. However, the "Round 1 always counts as live" rule is not true for a reload or late join during Round 1, and that regresses clients with correct clocks. See WR-05.

## Warnings

### WR-05: A Round 1 snapshot (reload or late join during Round 1) is sampled as if it were live and skews the countdown

**File:** `src/combat/useCombatController.ts:161-175`
**Issue:** The new sampler treats a round as live when it is Round 1 or when its number is higher than one this controller already saw (`!advanced && round.roundNumber !== 1n` is the only skip). The comment says a first sight of a later round "may be a snapshot up to one round old", so it is not sampled. The same reasoning applies to Round 1. A reload, reconnect-into-a-new-controller, or a late join while the fight is still in Round 1 delivers the Round 1 row as a snapshot. `lastSeenRound` is `null`, `roundNumber === 1n`, so `game.clock.sample(round.startedAtMicros)` runs against a row up to one full round old (`ROUND_TIMER_MICROS` is 10 s).

`sample()` sets `skew = startedAt - clientNow`. For a client with a correct clock this makes the skew about minus the round's age. The estimate then runs that many seconds behind the server, so the countdown shows up to `age` extra seconds. `resolving` stays false, and the hotbar, Ready and Flee stay enabled after the round has already expired. Before this commit the same user had skew 0 and a correct countdown. Round 2 re-samples (it is `advanced`), so the error lasts at most one round. The server stays authoritative, so the result is a wrong countdown and a refused action, not corrupt state. It is the same bias the fixer deliberately avoided for rounds 2 and later, and the fix report's "residual limit" note does not mention it.

**Fix:** Do not infer "live" from the round number alone. Options, in order of preference:
1. Expose a `roundsApplied` flag from `gameData` (the `combat_round` binding already has `applied`) and sample only rows that appear after the binding applied, plus the first round of a fight whose participant row appeared after the controller saw `combat.active === false`. Round 1 of a fight that was already active when the controller started is then treated as a snapshot.
2. If a fresh-fight signal is not available, treat any first sight of any round as a snapshot and sample only `advanced` rounds. This keeps the iteration-1 lockout for the first round of a quiet fight start on an ahead clock, so pair it with the "do not let the estimate alone disable input" option from the earlier review.

Add a test: `fake.openRound.value = open(1n, SERVER_MS - 5_000)` on a controller whose `combat.active` was already true at construction must leave `skewMicros` at 0.

## Info

### IN-01: `isTextField` and `compareIds` are copy-pasted across files

**File:** `src/combat/useCombatController.ts:25-37`, `src/hotbar/HotbarRow.vue:236-243`, `src/combat/hostiles.ts:97-99`
**Issue:** `isTextField` is byte-identical in the controller and `HotbarRow`, and Composer-style checks exist elsewhere. `compareIds` is duplicated in `hostiles.ts` and the controller. The two keyboard handlers must agree on what counts as typing, so drift between the copies is a latent bug.
**Fix:** Move `isTextField` (and `compareIds`) to one shared module, for example `src/input/focus.ts`, and import it in both places.

### IN-02: `VitalsRail` and `VitalsStrip` duplicate the damage-flash key latch

**File:** `src/frame/VitalsRail.vue:35-47`, `src/frame/VitalsStrip.vue:73-86`
**Issue:** The two-watcher "latch the key to the hp prop" workaround (a sync watcher on `props.hp` plus a `pre` watcher on `characterId`) is duplicated verbatim. It relies on Vue's job ordering (parent render before the child's `pre` watcher) to avoid a false drop on a character switch, which is fragile and undocumented outside the comment.
**Fix:** Fold the latch into `useDamageFlash` (accept `hp` and `key` from one source, or a single `() => ({ id, hp })` getter) so both components share one tested implementation and the ordering assumption lives in one place.

### IN-03: `inject(KEY, createInertX())` builds the whole inert object on every setup

**File:** `src/combat/EncounterPanel.vue:14-15`, `src/combat/EncounterStrip.vue:15-16`, `src/combat/RoundRow.vue:22-24`, `src/hotbar/HotbarRow.vue:26-28`, `src/rails/PartyBlock.vue:21-23`, `src/frame/VitalsStrip.vue:36-38`, `src/frame/AppFrame.vue:38`
**Issue:** The default argument is evaluated eagerly, so each component instance allocates a full inert `GameData`, including a feed store, a server clock and about 30 computed refs, even when the real provider is present. This pattern predates Phase 48 but the phase added several more hot call sites.
**Fix:** Use the factory form: `inject(GAME_KEY, () => createInertGame(), true)`.

### IN-04: Damage and heal emphasis mis-splits numbers with separators or decimals

**File:** `src/combat/emphasis.ts:9`
**Issue:** `/\b\d+\b/g` treats `1,234` as two integers (`1` and `234`) and `3.5` as `3` and `5`. The emphasised amount is therefore the trailing fragment. Large or fractional damage values produce a misleading bold span. Rendering stays safe (text nodes only).
**Fix:** Match a full number token, for example `/\b\d{1,3}(?:,\d{3})+\b|\b\d+(?:\.\d+)?\b/g`, or document that the server never emits separators or decimals.

### IN-05: Production code carries test-only exports and unused fields

**File:** `spacetimedb/src/views/combat.ts:13`, `src/combat/difficulty.ts:18-21`, `src/combat/hostiles.ts:56-57`
**Issue:** `MY_COMBAT_AGGRO_KEYS` is referenced only by `combat.test.ts`. `ConView.token` and `HostileView.percent` are never read by any component.
**Fix:** Remove the dead fields, or have the view's row type be derived from the `MY_COMBAT_AGGRO_KEYS` constant so the constant earns its place.

---

_Reviewed: 2026-10-06_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
