---
phase: 47-console-rails-hotbar-and-input
fixed_at: 2026-10-05T00:00:00Z
review_path: .planning/phases/47-console-rails-hotbar-and-input/47-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 47: Code Review Fix Report

**Fixed at:** 2026-10-05
**Source review:** .planning/phases/47-console-rails-hotbar-and-input/47-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5
- Fixed: 5
- Skipped: 0

Fixes were applied on the main checkout (master), one commit per finding, client only.
Each fix has a unit test that fails against the pre-fix code and passes after.
Gate: `vitest run --dir src --maxWorkers=2` 1368 passed (1354 before, 14 new, 0 failures), `vue-tsc -b` clean, `pnpm build` clean.

## Fixed Issues

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
_Iteration: 1_
