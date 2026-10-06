---
phase: 47-console-rails-hotbar-and-input
reviewed: 2026-10-05T00:00:00Z
depth: standard
iteration: 3
files_reviewed: 4
files_reviewed_list:
  - src/console/useConsole.ts
  - src/console/useConsole.test.ts
  - src/input/narrativeQueue.ts
  - src/input/narrativeQueue.test.ts
findings:
  critical: 0
  warning: 0
  info: 7
  total: 7
status: clean
---

# Phase 47: Code Review Report (iteration 3, final)

**Reviewed:** 2026-10-05
**Depth:** standard
**Files Reviewed:** 4
**Status:** clean (no Critical or Warning finding open; 7 info items carried forward)

## Summary

Re-review of commit 80dabea3 (the WR-06 fix). WR-06 is resolved, and the WR-02 generation token and the WR-03 refusal guard are unchanged and still correct. `vue-tsc --noEmit` is clean. `vitest run src/console/useConsole.test.ts src/input` passes (7 files, 316 tests).

### WR-06 verification (resolved)

- **The queued line records its NPC.**
  - `QueuedLine.conversationNpcId` is `bigint | null` (`narrativeQueue.ts:24`).
  - `narrativeSend` sets it from `conversation.value` at queue time (`useConsole.ts:184`). That is before a later `hail` changes the conversation, because `hail` assigns `conversation` only after `narrativeSend` returns.
  - For a talk line, `routeInput` always sets `npcId` to `ctx.conversation.id` (`routeInput.ts:296`). The recorded id is therefore the NPC the line was typed to.
- **The release rule matches the intended rule** (`useConsole.ts:216-228`).
  - `talkToNpc` goes to `queuedTo` only when all of these hold: `mode === 'narrative'`, `queuedTo !== null`, the current conversation NPC equals `queuedTo`, and that NPC is in `npcsHere`.
  - Every other case goes out as `submitIntent` with the same text, and the Queued suffix is cleared with `setQueued(false)`.
  - The only NPC id ever passed to `talkToNpc` is `queuedTo`, so a queued line cannot reach a different NPC.
  - Intent-mode lines never enter the talk branch, so they stay intents. This includes a `hail`, which is queued with the previous conversation id but has `mode: 'intent'`.
- **Edge cases traced.**
  - A -> B -> A: the line goes to A, which is still A.
  - Queued with no conversation, then a hail: `queuedTo` is null, so the line is an intent.
  - NPC left: the `stopNpcs` watch clears the conversation, and `npcStillHere` also covers the same-tick window before that watch flushes.
  - Direct (unqueued) talk sends are untouched and still use `line.npcId`.
- **Tests cover the rule.**
  - `a queued line never reaches a different NPC (WR-06)` has four cases: still A goes to A, then hail B goes to intent, then goodbye goes to intent, and no-conversation-then-hail goes to intent.
  - Each negative case asserts `talkToNpc` is never called.
  - The earlier NPC-left test (`useConsole.test.ts:520-536`) still passes.

### WR-02 and WR-03 regression check (none)

- **WR-02 token.** `release()` still reads `queue.token()` synchronously right after `takeNext` and passes it to `settle` in both branches and in the no-character early exit. `beginDirect`, `drop` and `settle(token)` in the queue are unchanged. The new field only adds data to `QueuedLine`, and the queue never reads it.
- **WR-03 guard.** `submit()` still clears the conversation only when `result !== 'refused'` (`useConsole.ts:316`). The `hail` case is unchanged.

## Warnings

None open.

## Info

Carried forward unchanged from iterations 1 and 2.

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

**File:** `src/console/keywords.ts:99-130`, `src/console/useConsole.ts:430-445`
**Issue:** Two related observations, both within the design. Neither is an exploit today.

- Player names are letters-only, 3-20 characters (`creation.ts:612-627`). A player named after a common word ("Door", "Torch") gets a player keyword. NPC, place and node names win the dedupe, but a generic noun in Keeper narration becomes a whisper pre-fill button for everyone at that location. It is cosmetic noise.
- A `place` keyword click calls `moveCharacter` immediately, with no confirmation. Eligible `location`-source narrative text is LLM output that another player's input can influence, so a crafted intent could steer the narration toward containing an adjacent place name.

**Fix:** Restrict `player` keywords to lines whose kind carries player names (`move`, `presence`, `system`), and consider a one-step confirm for travel keywords that come from `location`-source lines.

### IN-06: No timeout on a reducer promise that holds `inFlight`

**File:** `src/console/useConsole.ts:197`, `:229`
**Issue:** `inFlight` is released only when the reducer promise settles or `drop()` runs (on disconnect). A reducer call that never resolves on a live connection leaves every later narrative line queued. After three lines, every further narrative line is refused ("Wait for the Keeper to finish first.") until a reconnect. **Fix:** Cap the in-flight hold with a timer (for example 15 s, matching `SIGNIN_TIMEOUT_MS`) that calls `settle(token)`. The WR-02 token makes this safe to add.

### IN-07: Server clock skew is 0 until the first event row

**File:** `src/game/serverClock.ts:15-26`
**Issue:** `skewMicros` starts at 0 and is sampled only from event rows. The first `look` row usually arrives within moments, but until then cooldown sweeps use the raw client clock. A client clock behind the server shows lingering, already-expired `ability_cooldown` rows as cooling at the full duration, up to the clock offset. After the first sample it self-corrects. **Fix:** None needed beyond awareness. Optionally treat the clock as "unsynced" and suppress sweeps until the first `sample()`.

---

_Reviewed: 2026-10-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
