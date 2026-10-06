---
phase: 48-combat-encounter
reviewed: 2026-10-06T00:00:00Z
depth: standard
files_reviewed: 41
files_reviewed_list:
  - spacetimedb/src/views/combat.ts
  - src/combat/EncounterPanel.vue
  - src/combat/EncounterStrip.vue
  - src/combat/HostileCard.vue
  - src/combat/InCombatTag.vue
  - src/combat/RoundRow.vue
  - src/combat/ThreatBlock.vue
  - src/combat/ally.ts
  - src/combat/choice.ts
  - src/combat/combatFeed.ts
  - src/combat/cycling.ts
  - src/combat/difficulty.ts
  - src/combat/emphasis.ts
  - src/combat/hostiles.ts
  - src/combat/roundClock.ts
  - src/combat/roundCooldown.ts
  - src/combat/threat.ts
  - src/combat/useCombatController.ts
  - src/combat/useDamageFlash.ts
  - src/combat/windup.ts
  - src/console/FeedLine.vue
  - src/console/FeedView.vue
  - src/console/feedStore.ts
  - src/console/lines.ts
  - src/frame/AppFrame.vue
  - src/frame/ContextRail.vue
  - src/frame/FeedShell.vue
  - src/frame/HeaderBar.vue
  - src/frame/MoreSheet.vue
  - src/frame/Sheet.vue
  - src/frame/VitalsRail.vue
  - src/frame/VitalsStrip.vue
  - src/frame/tabs.ts
  - src/frame/useScreens.ts
  - src/game/context.ts
  - src/game/gameData.ts
  - src/game/queries.ts
  - src/hotbar/HotbarRow.vue
  - src/input/Composer.vue
  - src/rails/PartyBlock.vue
  - src/rails/party.ts
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 48: Code Review Report

**Reviewed:** 2026-10-06
**Depth:** standard
**Files Reviewed:** 41
**Status:** issues_found

## Summary

The 41 files were read in full. In addition, `net/bindTable.ts`, `game/keyedBinding.ts`, `game/serverClock.ts`, `hotbar/useCooldownTicker.ts`, the SpacetimeDB SDK's `SubscribeApplied` handler in `node_modules/spacetimedb/src/sdk/db_connection_impl.ts`, and the server's `set_combat_target`, `appendPrivateEvent` and `handleCombatNarrationResult` were traced for cross-file facts. The related vitest suites (src/combat, console, frame, game, hotbar, rails, input: 72 files, 1538 tests) pass, and `vue-tsc --noEmit` is clean.

The security focus areas hold up:

- **`my_combat_aggro`** reaches `aggro_entry` only through chained index lookups (`player.id.find` -> `character.by_owner_user` -> `combat_participant.by_character` -> `aggro_entry.by_combat`). No `.iter()` scan is used, every index exists in `schema/tables.ts`, and the row type matches the `u64` columns. A subscriber sees only fights their own characters take part in, and pet rows are dropped.
- **XSS:** there is no `v-html`, `innerHTML` or equivalent in any reviewed file. Every server or model string (enemy names, ability names, narration, damage lines) is rendered through `{{ }}` or title and aria attributes. `emphasis.ts` splits into three plain strings.
- **Acting identity:** every reducer call takes `characterId` from `game.characterId`. The only other identity sent is `targetCharacterId` (the ally), and the server's `requireCharacterOwnedBy` guards the acting one. `set_combat_target` validates the enemy against the caller's combat server-side.
- **Cleanup:** the round-clock ticker and watchers are scope-bound and `dispose()` removes the single document keydown listener. `HotbarRow`, `Composer` and `Sheet` remove their listeners on unmount. The damage-flash timers, the hotbar flash timers, the ResizeObserver (disconnected when the root `v-if` drops and on unmount) and the narrative linger timer (cleared on a new fight, on `reset()` and on scope dispose) are all released.
- **Screen lock and `'encounter'` lifecycle:** `useScreens` closes foreign screens on lock and the encounter sheet on unlock. `syncLayout` clears `'encounter'` and `'more'` when crossing to desktop.

No BLOCKER-class defect was found. One real ordering bug (WR-01) makes the "initial snapshot is only remembered" wind-up rule fail against the real subscription plumbing, and it is hidden by tests that use the opposite ordering. The other warnings are robustness gaps.

## Warnings

### WR-01: Wind-up snapshot is taken before the rows land, so every existing cast is re-announced on a mid-fight load

**File:** `src/combat/combatFeed.ts:61-114` (root cause in `src/net/bindTable.ts:111-118`)
**Issue:** The casts watcher is `flush: 'sync'` over `[combatId, castsApplied, casts]` and treats the first `applied === true` pass as the snapshot (`snapshotTaken = true`, ids added to `seenCasts`). In the real SDK the order inside `SubscribeApplied` is: cache updated, then `subscription.emitter.emit('applied')`, then the row callbacks are dispatched (`db_connection_impl.ts` ~L968-971). In `bindTable.onApplied` the code runs `applied.value = true; failed.value = false; refresh();`. So:

1. `applied.value = true` makes the sync watcher fire while `casts` is still `[]` (the binding's rows have not been refreshed yet). The snapshot is recorded empty.
2. `refresh()` then fills `rows` with the fight's existing casts. They are all "new" ids, so every one of them gets a `windup:{id}` block appended to the feed.

Visible effect: a mid-fight reload, a late join, or any open that already has active casts shows a fresh "X winds up Y" block for each. They are stamped at the server-clock "now", or at the next-round header, which contradicts the documented rule (UI-SPEC and the file header). The unit tests in `combatFeed.test.ts` (L93-L104) set `casts` before flipping `castsApplied`, which is the opposite of the production ordering, so they cannot catch this.

**Fix:** Make `bindTable` publish rows before the flag, so a sync watcher that sees `applied` also sees the snapshot:
```ts
.onApplied(() => {
  if (currentConn !== conn) { /* unchanged stale path */ return; }
  refresh();            // rows first
  applied.value = true; // then the flag
  failed.value = false;
})
```
Add a `gameData`-level test with a fake conn that flips `applied` before delivering rows. Alternatively, make the snapshot robust in `combatFeed.ts` by deferring the snapshot until the next microtask or until `casts` is non-empty.

### WR-02: A refused or failed target request leaves `lastRequested` and the "Target: {name}" status line wrong

**File:** `src/combat/useCombatController.ts:55-72`
**Issue:** `send()` sets `lastRequested = enemyId` and `targetStatus = 'Target: {name}'` before the reducer resolves. `set_combat_target` is server-validated and can refuse ('Enemy not in combat'; the enemy may have died or the fight ended between the click and the call). In that case the character's real `combatTargetEnemyId` is unchanged, but:
- the screen-reader status line has already announced a target that was never set. This is optimistic state, which CLAUDE.md ("Let subscriptions drive state") and the phase's "no optimistic state" rule say to avoid;
- `lastRequested` becomes the cycle base, so the next Tab skips relative to a target the server never accepted. `nextTargetId` prefers `lastRequested` over `current` whenever it is still living.

The `catch` only logs, and the "server writes refusals into the feed" comment covers refusals that return normally, not rejections.

**Fix:** Roll back on rejection (only if nothing newer was requested), and ideally derive the announcement from the confirmed target:
```ts
} catch (error) {
  if (lastRequested === enemyId) {
    lastRequested = null;
    targetStatus.value = '';
  }
  console.warn('[combat] set_combat_target failed', error);
}
```
Better still, drive `targetStatus` from a `watch` on `game.character.value?.combatTargetEnemyId` so the announcement follows the server echo.

### WR-03: Combat gating depends on a server-clock estimate that is only sampled from feed events

**File:** `src/combat/roundClock.ts:25-41`, `src/combat/useCombatController.ts:113-119`, `src/game/gameData.ts:151-156`
**Issue:** `resolving` (and with it `inert` for hotbar slots, Ready and Flee) is computed as `timerExpiresAtMicros - clock.nowMicros() <= 0`. `clock.nowMicros()` is `Date.now()*1000 + skew`, and skew is updated only by `onEvent` (feed rows). After a mid-fight reload, or on a quiet fight start, skew is 0 until the first event row arrives. A client whose clock is ahead of the server by more than the time left in the open round (several seconds is common on unsynced machines) shows "Resolving…" and disables all round controls while the round is actually open. This can cost a round before the next event samples the clock. The server remains authoritative, so the harm is a client-side lockout, not bad state.

**Fix:** Do not let the estimate alone disable input. Either keep controls enabled and let the server refuse, or sample the clock from live round rows. For the sampling option, sample only rows first seen after the `combat_round` binding applied; the first snapshot's rows are up to one round old and would bias the skew. For example, in the rounds watcher:
```ts
if (appliedBefore && round.state === 'action_select' && round.startedAtMicros !== 0n) clock.sample(round.startedAtMicros);
```

### WR-04: Spurious "ready" flash on every cooling slot when combat starts or ends

**File:** `src/hotbar/HotbarRow.vue:150-175` (the `remaining` unit switch at L116-L134)
**Issue:** The ready-flash watcher fires when a slot's `remaining` goes from `> 0` to `<= 0`. `remaining` changes unit with `inCombat`: wall-clock microseconds out of combat, `Number(roundsRemaining)` in combat.
- **Combat start:** a slot still on a wall-clock cooldown (for example 12_000_000) moves to `roundsRemaining`, usually 0. The watcher sees `> 0` then `0` and flashes the "ability ready" ring on every such slot.
- **Combat end:** a slot with rounds left moves to a wall-clock value that is commonly 0, so it flashes again.

Neither is a real cooldown completion, so the flash is a false "ready" signal. It is suppressed only under reduced motion.

**Fix:** Reset the baseline when the mode changes. For example, key the comparison on `inCombat`, and skip the flash when the previous snapshot was taken in the other mode:
```ts
watch(
  () => [inCombat.value, slotStates.value.map(...)] as const,
  ([mode, next], [prevMode, previous] = [mode, []]) => {
    if (mode !== prevMode) return;
    /* existing comparison */
  },
);
```

## Info

### IN-01: `isTextField` and `compareIds` are copy-pasted across files

**File:** `src/combat/useCombatController.ts:25-37`, `src/hotbar/HotbarRow.vue:225-232`, `src/combat/hostiles.ts:97-99`
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
