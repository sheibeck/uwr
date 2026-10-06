---
phase: 48-combat-encounter
reviewed: 2026-10-06T00:00:00Z
depth: standard
iteration: 3
files_reviewed: 5
files_reviewed_list:
  - src/combat/useCombatController.ts
  - src/combat/useCombatController.test.ts
  - src/game/context.ts
  - src/game/gameData.ts
  - src/game/gameData.test.ts
findings:
  critical: 0
  warning: 1
  info: 5
  total: 6
status: issues_found
---

# Phase 48: Code Review Report (iteration 3)

**Reviewed:** 2026-10-06
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

This is the final re-review after commit b45005df (WR-05 fix). I read the diff (`b45005df^..b45005df`) and traced `combat.active`, `fightRounds`, `createKeyed`, `deriveScreen` and `App.vue`/`AppFrame.vue` to see when the controller is constructed relative to the combat bindings. `vitest run src/combat src/game` passes (22 files, 407 tests) and `vue-tsc -b` is clean.

Verdicts:

- **Type safety and defaults: OK.** `roundsApplied` is a required member of `CombatData`. Its inert default is `constant(false)` and `gameData` supplies `computed(() => fightRounds.current.value?.applied.value ?? false)`, the same pattern as `castsApplied`. The only places that build a `CombatData` are `createInertCombatData`, `createGameData` and test fakes that spread the inert block, so every consumer still type-checks. The inert false means the sampler only runs its fresh-start branch, so a hub-less controller never samples a stale row through the applied branch.
- **WR-01: no regression.** The `applied` branch relies on the WR-01 ordering (rows published, then the flag flips). A snapshot therefore arrives while `roundsApplied` is false. A new fight's round that arrives through a keyed promotion (the promoted binding is already applied) is correctly sampled as live.
- **WR-03: no regression.** A round that arrives after the round binding applied samples, so the ahead-clock lockout stays fixed for Round 2 onward. A fight that starts while the controller sees `active === false` still samples Round 1, so a client clock that runs ahead does not lock the round controls at the start of a fight.
- **WR-05: only partly resolved.** The sampler is correct for later-round snapshots and for a controller constructed with `active === true`, but it does not discriminate the main reload case in production. See WR-06.

## Warnings

### WR-06: `seenInactive` is true on every reload, so a Round 1 snapshot is still sampled (WR-05 residual is wider than documented)

**File:** `src/combat/useCombatController.ts:166-173` (and `src/game/gameData.ts:600`, `src/session/deriveScreen.ts:62-64`)
**Issue:** `seenInactive` is latched by an `immediate` sync watcher on `combat.active`. `combat.active` is `ownParticipantRows.length > 0`, and the own-participant binding is keyed by the character id. `AppFrame` (the only place the controller is created, `AppFrame.vue:64`) mounts as soon as the character row has loaded (`deriveScreen` returns `frame` on `activeCharacterLoaded`). That is the same tick the character key is set and the `combat_participant` binding is attached, which is a network round trip before its snapshot arrives. So on a reload, a reconnect into a new controller, or selecting a character who is mid-fight, the controller is always constructed with `active === false`, and `seenInactive` becomes true immediately. The participant snapshot then flips `active` to true, the `combat_round` binding attaches, and its Round 1 snapshot (with `roundsApplied` still false) satisfies `seenInactive && roundNumber === 1n`. The snapshot is therefore sampled, which is exactly the WR-05 scenario.

The fix report's residual limit says only "a late joiner that sees Round 1 of a fight begun elsewhere". It is not limited to late joiners. It covers every entry into a fight that is still in Round 1, which is the common reload case. The new test "does not sample a Round 1 snapshot delivered to a controller that starts in combat" passes only because the fake starts with `active = true`; production never constructs the controller that way for this path. So the test does not cover the scenario it is named for.

Impact is bounded and self-correcting. The error is at most one round (`ROUND_TIMER_MICROS`, 10 s). `sample()` sets skew from a row up to one round old, so a correct-clock client shows up to `age` extra seconds, and the hotbar, Ready and Flee stay enabled after the round has expired. The server stays authoritative, so the result is a wrong countdown and a refused action, not corrupt state. Round 2 arrives after `roundsApplied`, so it re-samples and the error ends. Later-round reload snapshots are not sampled, so only a Round 1 reload is affected. Not worse than one round, so it is a Warning and not a Critical, but the documented fix claim ("resolved") is not accurate.

**Fix:** Latch `seenInactive` only when the own-participant binding has applied and is empty, i.e. "the server told me I am not in a fight". A reload never passes through that state; a fight that starts while watching does.
1. Add `participantApplied: Readonly<Ref<boolean>>` to `CombatData` (inert `constant(false)`, `gameData`: `computed(() => ownParticipant.current.value?.applied.value ?? false)`).
2. In the controller: `watch(() => combat.participantApplied.value && !combat.active.value, (idle) => { if (idle) seenInactive = true; }, { flush: 'sync', immediate: true })`.
3. Add a test that starts the controller with `active = false` and `participantApplied = false`, then sets `active = true` and delivers `open(1n, SERVER_MS - 5_000)`; `skewMicros` must stay 0. Keep the existing fresh-start tests but set `participantApplied = true` while `active` is false.

If the change is deferred, at least correct the fix report to say the limit covers any entry into a Round 1 fight (including reload), and replace the misleading "starts in combat" test with one that constructs the controller with `active = false`.

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

## Post-loop follow-up (orchestrator, 2026-10-06)

The --auto loop reached its 3-iteration cap with WR-06 open. WR-06 was then fixed exactly as prescribed in commit d2d74a7b: `combat.participantApplied` added, and `seenInactive` now latches only when the server has confirmed the player is not in a fight. Two tests were added, including the production reload order. The gate passed: 1882 client tests, vue-tsc and build. The fix has not been through another review, so this file keeps `status: issues_found` until the next review. See 48-REVIEW-FIX.md (iteration 3).
