---
phase: 47-console-rails-hotbar-and-input
fixed_at: 2026-10-05T00:00:00Z
review_path: .planning/phases/47-console-rails-hotbar-and-input/47-REVIEW.md
iteration: 2
findings_in_scope: 1
fixed: 1
skipped: 0
status: all_fixed
---

# Phase 47: Code Review Fix Report

**Fixed at:** 2026-10-05
**Source review:** .planning/phases/47-console-rails-hotbar-and-input/47-REVIEW.md
**Iteration:** 2

**Summary:**
- Findings in scope (this iteration): 1 (WR-06)
- Fixed: 1
- Skipped: 0
- Carried forward from iteration 1: 5 findings (WR-01 to WR-05), all fixed

Fixes were applied on the main checkout (master), one commit per finding, client only.
Iteration 2 gate: `vitest run --dir src --maxWorkers=2` 1372 passed (1368 before, 4 new, 0 failures), `vue-tsc -b` clean, `pnpm build` clean.

## Fixed Issues

### WR-06: A queued talk line is sent to whichever NPC is current at release time, or as a plain intent

**Files modified:** `src/input/narrativeQueue.ts`, `src/input/narrativeQueue.test.ts`, `src/console/useConsole.ts`, `src/console/useConsole.test.ts`
**Commit:** 80dabea3
**Applied fix:** `QueuedLine` gains `conversationNpcId: bigint | null`, recorded in `narrativeSend` at queue time (the open conversation NPC, or null when there is none). `release()` now decides the route against that id:
- A `narrative` line queued in a conversation is sent with `talkToNpc` to the queued NPC only when the current conversation is still with that same NPC and that NPC is still here.
- Every other case is sent as `submitIntent` with the same text, with the Queued suffix cleared: the conversation ended, it switched to another NPC, the NPC left, or the line was queued with no conversation (so a line typed outside a conversation is never pulled into one that starts later).

The WR-02 generation token is untouched: `token()` is still read right after `takeNext`, and the settle still carries it.
Tests (in `useConsole.test.ts`, `a queued line never reaches a different NPC (WR-06)`): queued to A and still talking to A goes to A; queued to A then `hail B` goes to intent and `talkToNpc` is never called; queued to A then `goodbye` goes to intent; queued with no conversation then a hail goes to intent. The queue test helper gained the new field.
**Status note:** logic fix, requires human verification. Intent-mode lines (`look`, a hail) queued during a conversation stay intents, as before. Only `narrative` talk lines can go to `talkToNpc`.

## Carried Forward From Iteration 1

All five iteration-1 findings were fixed in iteration 1 and re-verified clean in the iteration-2 review.

### WR-01: The client-side second filter does not check the row's location, group or owner

**Files modified:** `src/game/gameData.ts`, `src/game/gameData.test.ts`
**Commit:** 9e1aab87
**Applied fix:** `keyedEvent` takes a `matches(row, key)` predicate, like `keyedTable`. Its `onRow` drops rows that do not match before the clock sample and the feed ingest. `event_location` matches `locationId`, `event_group` matches `groupId`, `event_private` matches `ownerUserId`. Four new tests cover each source plus "a dropped straggler does not sample the clock". Existing tests gained the key fields on their rows.

### WR-02: A stale `settle()` from a dropped send clears `inFlight` for a newer send

**Files modified:** `src/input/narrativeQueue.ts`, `src/input/narrativeQueue.test.ts`, `src/console/useConsole.ts`, `src/console/useConsole.test.ts`
**Commit:** 29d7a412
**Applied fix:** The queue keeps a generation counter. `beginDirect()` returns a token, `token()` returns the current one after `takeNext()`, `drop()` bumps it, and `settle(token)` is a no-op for a stale token. `useConsole` passes the token from `narrativeSend` and `release`. `settle()` without a token still clears unconditionally, so older callers and tests are unchanged. Tests: two queue unit tests and a console test (send, disconnect, reconnect, new send, old promise settles, next line must still queue).
**Status note:** logic fix, requires human verification.

### WR-03: A refused submit still ends the conversation

**Files modified:** `src/console/useConsole.ts`, `src/console/useConsole.test.ts`
**Commit:** 43a75f7b
**Applied fix:** The intent route clears the conversation after the send, only when the result is not `'refused'`. This is the same guard the hail case uses. Tests: a refused `look` keeps the conversation and the draft, and an accepted (queued) `look` still ends it.
**Status note:** logic fix, requires human verification.

### WR-04: A party member with no character row renders a blank name

**Files modified:** `src/rails/PartyBlock.vue`, `src/rails/PartyBlock.test.ts`
**Commit:** 6b0ea564
**Applied fix:** The visible name and its `title` use `memberLabel(member)`, so an unknown member reads "Member". Test checks the unknown row's text and title, and that a known member still shows its name.

### WR-05: Swap-on-applied has no failure path, so stale rows stay forever

**Files modified:** `src/game/keyedBinding.ts`, `src/game/keyedBinding.test.ts`, `src/game/gameData.test.ts`
**Commit:** 845a849f
**Applied fix:** `AttachableBinding` now has `failed`. The pending watch promotes the new binding when it applies or fails (or is already failed when made). Promoting disposes the old binding, which clears the stale rows, and the failed binding becomes `current`. `Keyed` gains `failed`, a computed of the shown binding's failed flag. A later reconnect re-attaches the shown binding, so it can recover and the flag clears. Tests: three keyed tests (fail promotes and clears, recovery after a failure, already-failed on make) and a `gameData` test that `npcsHere` empties when the new location's npc binding fails.
**Status note:** logic fix, requires human verification. `Keyed.failed` is exposed but not yet surfaced in any `GameData` field or UI. The stale-row hazard is gone, and showing a "could not load" state is a separate UI change.

## Skipped Issues

None.

---

_Fixed: 2026-10-05_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
