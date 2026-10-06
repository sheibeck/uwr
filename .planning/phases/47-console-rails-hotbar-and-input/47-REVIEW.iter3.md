---
phase: 47-console-rails-hotbar-and-input
reviewed: 2026-10-05T00:00:00Z
depth: standard
iteration: 2
files_reviewed: 10
files_reviewed_list:
  - src/console/useConsole.ts
  - src/console/useConsole.test.ts
  - src/game/gameData.ts
  - src/game/gameData.test.ts
  - src/game/keyedBinding.ts
  - src/game/keyedBinding.test.ts
  - src/input/narrativeQueue.ts
  - src/input/narrativeQueue.test.ts
  - src/rails/PartyBlock.vue
  - src/rails/PartyBlock.test.ts
findings:
  critical: 0
  warning: 1
  info: 7
  total: 8
status: issues_found
---

# Phase 47: Code Review Report (iteration 2)

**Reviewed:** 2026-10-05
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Re-review of the five iteration-1 warning fixes (commits 9e1aab87, 29d7a412, 43a75f7b, 6b0ea564, 845a849f). All five resolve their findings and none introduces a regression. `vue-tsc --noEmit` is clean and `vitest run --dir src` passes (78 files, 1368 tests).

One new warning (WR-06) was found while tracing the queue release path for WR-02 and WR-03. It is pre-existing, not a regression from the fixes. Iteration-1 info items IN-01 to IN-07 are carried forward unchanged.

### Fix verification

- **WR-01 (resolved).** The predicates use the real generated field names and types:
  - `event_private_table.ts` has `ownerUserId: u64`, `event_location_table.ts` has `locationId: u64`, and `event_group_table.ts` has `groupId: u64`.
  - All three are bigints, as are the keys (`userKey`, `locationKey`, `groupKey`), so `===` is correct.
  - Each key is the same value the subscription SQL is built from, so a matching row is never dropped.
  - The predicate runs before `onEvent`, so the clock sample and feed ingest are skipped for stragglers.
  - Event bindings use `swap: 'immediate'`, so the old binding is disposed and its listener removed on swap. Only stragglers delivered through the new binding's table-wide listener need filtering, and they are now filtered.
- **WR-02 (resolved).** Traced across the transitions you named:
  - **Drop (disconnect or character change):** `drop()` bumps the generation. Send A's `.finally` carries the old token and is a no-op. `inFlight` was already cleared by `drop()`.
  - **Reconnect then new direct send B:** `beginDirect()` bumps again, so A's late settle is ignored and B's own settle (current token) clears `inFlight`.
  - **Released line (`takeNext`):** the token is read via `token()` synchronously right after `takeNext`, with no interleaving.
  - **No-character early exit:** the exit settles with the current token, which is correct.
  - **Tokenless `settle()`:** it is still unconditional and used by no production caller now.
  - **Dispose and character-change paths:** they route through `dropQueue` and `drop()`, so the token is invalidated there too.
- **WR-03 (resolved).** `conversation` is cleared only when `result !== 'refused'`, which matches the `hail` guard. The non-queue branch always yields `'sent'`, so it clears as before. A refused line keeps both the draft and the conversation.
- **WR-04 (resolved).** The visible text and `title` use `memberLabel(member)`. A known member shows its name and an unknown one shows "Member", matching the aria-labels and `VitalsStrip`.
- **WR-05 (resolved).** The pending watch now promotes on `applied || failed`, and the already-settled case at make time is covered.
  - Promoting disposes the old binding, so stale rows clear and stop driving hail, gather and route actions.
  - `bindTable` and `bindEventTable` both expose `failed`, so the new `AttachableBinding.failed` requirement is satisfied. The only `createKeyed` call sites are in `gameData.ts`, and `vue-tsc` is clean.
  - **Reconnect recovery:** the conn watch re-attaches `current`. `attach(newConn)` differs from the stored conn (or from `null` after a drop), so it detaches, re-subscribes, and `onApplied` resets `failed` to false.
  - **Key change while disconnected:** the new binding attaches to `null`, so `applied` and `failed` are both false and the pending watch waits. On reconnect both current and pending re-attach.
  - **A failure after promote:** it only sets `Keyed.failed`, and nothing acts on stale data.

## Warnings

### WR-06: A queued talk line is sent to whichever NPC is current at release time, or as a plain intent

**File:** `src/console/useConsole.ts:196-217` (with `src/input/narrativeQueue.ts:15-20`, enqueue at `:170-181`)
**Issue:** This is pre-existing and not a regression from the five fixes, but it interacts with WR-03's "accepted queued line ends the conversation" path.

`QueuedLine` stores only `text`, `mode` and `echoKey`. The NPC id from a `talk` route (`npcId` in `NarrativeLine`) is dropped at `enqueue`. At release, `release()` resolves the target from the current `conversation.value`.

Scenarios:

- Queue "hello" to NPC A, then `hail B` (queued, and it sets `conversation` to B immediately). When "hello" is released it goes to B via `talkToNpc`. This is the wrong recipient.
- Queue "hello" to A, then queue `look` (an intent that ends the conversation, now cleared at accept time). When "hello" is released, `target` is null, so it is sent as a plain `submitIntent`. It is no longer a conversation line and the NPC never gets it.

Both need the Keeper gate or an in-flight send, which is exactly when the queue is used.

**Fix:** Carry the target on the queued line and use it at release:
```ts
// narrativeQueue.ts
export interface QueuedLine { text: string; mode: 'narrative' | 'intent'; echoKey: string; npcId?: bigint }

// useConsole.ts narrativeSend
queue.enqueue({ text: line.text, mode: line.mode, echoKey, npcId: line.npcId });

// useConsole.ts release
const npcId = line.npcId;
const npcStillHere = npcId !== undefined && game.npcsHere.value.some((n) => n.id === npcId);
if (line.mode === 'narrative' && npcId !== undefined && npcStillHere) {
  game.feed.remove(line.echoKey);
  sent = fire('talkToNpc', (r) => r.talkToNpc({ characterId, npcId, message: line.text }));
} else { /* existing submitIntent path */ }
```
Add a test that a queued talk line follows its original NPC after a later hail.

## Info

Carried forward unchanged from iteration 1.

### IN-01: Bare `accept` / `decline` inside a conversation never reach the NPC

**File:** `src/input/routeInput.ts:217-222`
**Issue:** Per CONTEXT, `accept` and `decline` with nothing after them are commands, and rule 3 runs before the conversation rule. With no pending group invite, `defaultInviter` returns `''` and `acceptGroupInvite({ fromName: '' })` is sent. A player answering an NPC's quest offer with the single word "accept" gets a group-invite refusal, not a reply.

This matches the written spec but is a likely UX trap. **Fix:** When `ctx.pendingInviterNames` is empty, fall through to the conversation or intent path instead of returning the reducer route. Tests would need to cover that case.

### IN-02: Safari IME composition commit can submit the line

**File:** `src/input/Composer.vue:62-69`
**Issue:** The `Enter` guard relies on `event.isComposing`. Safari reports `isComposing === false` with `keyCode === 229` for the Enter that commits an IME composition, so a CJK or other IME user can send a half-composed line. **Fix:** Also bail when `event.keyCode === 229`.

### IN-03: Hotbar number keys use `event.key`

**File:** `src/hotbar/HotbarRow.vue:190`
**Issue:** On layouts where the unshifted top row is not digits (AZERTY), `event.key` is `&`, `é` and so on, so slots 1-0 cannot be triggered from the keyboard. **Fix:** Match `event.code` (`Digit1`..`Digit0`, optionally `Numpad`) as well as `event.key`.

### IN-04: `inputFocused` can stick at true when the Composer unmounts focused

**File:** `src/input/Composer.vue:111-113`
**Issue:** `onBeforeUnmount` removes the document listener but does not reset `consoleApi.inputFocused`. A desktop-to-mobile breakpoint swap remounts `FeedShell` (the `v-if` in `AppFrame`), and browsers do not reliably fire `blur` on a removed element. `useKeyboardOpen` can then treat the input as focused until the next focus and blur. **Fix:** Set `consoleApi.inputFocused.value = false` in `onBeforeUnmount`.

### IN-05: Keyword surface that depends on server and LLM text

**File:** `src/console/keywords.ts:99-130`, `src/console/useConsole.ts:369-377`
**Issue:** Two related observations, both within the design. Neither is an exploit today.

- Player names are letters-only, 3-20 characters (`creation.ts:612-627`). A player named after a common word ("Door", "Torch") gets a player keyword. NPC, place and node names win the dedupe, but a generic noun in Keeper narration becomes a whisper pre-fill button for everyone at that location. It is cosmetic noise.
- A `place` keyword click calls `moveCharacter` immediately, with no confirmation. Eligible `location`-source narrative text is LLM output that another player's input can influence, so a crafted intent could steer the narration toward containing an adjacent place name.

**Fix:** Restrict `player` keywords to lines whose kind carries player names (`move`, `presence`, `system`), and consider a one-step confirm for travel keywords that come from `location`-source lines.

### IN-06: No timeout on a reducer promise that holds `inFlight`

**File:** `src/console/useConsole.ts:187-192`
**Issue:** `inFlight` is released only when the reducer promise settles or `drop()` runs (on disconnect). A reducer call that never resolves on a live connection leaves every later narrative line queued. After three lines, every further narrative line is refused ("Wait for the Keeper to finish first.") until a reconnect. **Fix:** Cap the in-flight hold with a timer (for example 15 s, matching `SIGNIN_TIMEOUT_MS`) that calls `settle(token)`. The WR-02 token now makes this safe to add.

### IN-07: Server clock skew is 0 until the first event row

**File:** `src/game/serverClock.ts:15-26`
**Issue:** `skewMicros` starts at 0 and is sampled only from event rows. The first `look` row usually arrives within moments, but until then cooldown sweeps use the raw client clock. A client clock behind the server shows lingering, already-expired `ability_cooldown` rows as cooling at the full duration, up to the clock offset. After the first sample it self-corrects. **Fix:** None needed beyond awareness. Optionally treat the clock as "unsynced" and suppress sweeps until the first `sample()`.

---

_Reviewed: 2026-10-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
