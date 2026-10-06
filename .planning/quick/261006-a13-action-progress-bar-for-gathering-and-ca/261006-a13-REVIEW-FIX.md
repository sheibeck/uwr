---
phase: quick-261006-a13
fixed_at: 2026-10-06T00:00:00Z
review_path: .planning/quick/261006-a13-action-progress-bar-for-gathering-and-ca/261006-a13-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 5
status: all_fixed
---

# Quick 261006-a13: Code Review Fix Report

**Fixed at:** 2026-10-06
**Source review:** `.planning/quick/261006-a13-action-progress-bar-for-gathering-and-ca/261006-a13-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (WR-01 to WR-04, plus the cheap info items IN-01 and IN-03)
- Fixed: 6
- Skipped (out of scope by instruction): 5 (IN-02, IN-04, IN-05, IN-06, IN-07)

Work ran in the main checkout on master, as instructed (no separate worktree). No push, publish or server action.

## Fixed Issues

### WR-01: First-seen frozen under the clock skew at row arrival

**Files modified:** `src/action/useActionProgress.ts`, `src/action/useActionProgress.test.ts`
**Commit:** 1a9cf02e
**Applied fix:** First-seen is stored in client time (`nowMicros() - skewMicros`) and the current skew is added on every read. The clock input is `Pick<ServerClock, 'nowMicros' | 'skewMicros'>`. The ticker samples client time too, so a skew change moves `now` and the start together with no jump before the next tick. Tests: a skew sampled after the row arrived, with the client behind (13 s becomes 8 s, fraction stays 0, then 0.5 after 4 s) and with the client ahead (no stuck "Finishing").
**Status note:** logic fix, requires human verification.

### WR-04: A newly shown action could read more seconds than its total

**Files modified:** `src/action/useActionProgress.ts`, `src/action/useActionProgress.test.ts`
**Commit:** 5131073e
**Applied fix:** `now = Math.max(tick, seen)`, with the ticker value and first-seen both in the current-skew domain. Test: a cast inserted over a running gather under reduced motion with a stale ticker reads 3s (not 4s) and a fraction of 0. Confirmed the test fails without the clamp.
**Status note:** logic fix, requires human verification.

### WR-02: First-seen state lived in the component

**Files modified:** `src/action/actionFirstSeen.ts` (new), `src/action/actionProgress.ts`, `src/action/useActionProgress.ts`, `src/action/ActionRow.vue`, `src/game/context.ts`, `src/game/gameData.ts` (plus the tests listed under WR-03)
**Commit:** 8b0b94e3
**Applied fix:**
- New `createActionFirstSeen({ gathers, casts, now })` in `src/action/actionFirstSeen.ts`. It holds a replaced-not-mutated map from row key (`gather:{id}` / `cast:{id}`) to client microseconds. A synchronous watch adds new keys at arrival and drops keys when their rows go; `reset()` empties it.
- `createGameData` builds it from the own gather and cast rows and exposes it as `GameData.actionFirstSeen` (inert empty default in `createInertGame`). `reset()` (logout, connection reset) calls `actionSeen.reset()`.
- `useActionProgress` takes `firstSeen` as an input instead of owning a map. `ActionRow` passes `game.actionFirstSeen`.
- `actionKeys(sources)` is replaced by `actionRowKeys(gathers, casts)` plus exported `gatherKey` / `castKey`, so the key format is defined once.
- This is a new file, as the review's fix implied: it keeps the data-layer map testable without a connection.

### WR-03: Tests for the anchoring failure modes

**Files modified:** `src/action/useActionProgress.test.ts`, `src/action/ActionRow.test.ts`, `src/game/gameData.test.ts` (CRLF preserved), `src/action/actionProgress.test.ts`
**Commit:** 8b0b94e3 (the skew test is in 1a9cf02e, and the replace-while-running test is in 5131073e)
**Applied fix:** Added tests for each case asked for:
- Skew changing mid-action (WR-01 commit).
- Remount keeping the start: composable (stop the scope, new composable on the same map) and component (unmount, mount again).
- Character switch: composable (other character's rows hidden, timer stopped, resumes with the original start) and `createGameData` (the previous character's entries drop when the new binding applies).
- Logout: `createGameData` `reset()` empties the map, and a composable and component test start afresh after the reset.
- A cast first seen mid-cast starts at 0.5 at once.
- An action appearing after mount: composable and component.
- Also covered: a combat toggle keeping the start, first-seen keyed by row id with the stored time untouched by a later skew sample, and re-delivered rows not resetting the entry.

Not covered, still open from the review's WR-03 list: the reduced-motion CSS test is still a source-text regex.

### IN-01: Unused `totalSeconds`

**Files modified:** `src/action/actionProgress.ts`, `src/action/actionProgress.test.ts`
**Commit:** bb5af426
**Applied fix:** Removed `totalSeconds` from `ActionProgress`, its computation, and the test assertions that pinned it.

### IN-03: Screen readers heard the label three times

**Files modified:** `src/action/ActionRow.vue`, `src/action/ActionRow.test.ts`
**Commit:** de6fd229
**Applied fix:** `.action-label` is `aria-hidden="true"` and `aria-valuetext` is now only the time text, so the label is read once, from the progressbar's `aria-label`. The row's `title` keeps the full summary. The test asserts both.

## Skipped Issues

The fix scope for this run was WR-01 to WR-04 plus the two cheap info items. The rest are recorded here with reasons.

### IN-02: "Finishing…" can show indefinitely while disconnected

**File:** `src/action/useActionProgress.ts` (with `src/net/bindTable.ts:50-53`)
**Reason:** Skipped by instruction. It is a trade-off: hiding the row or changing the copy while disconnected is a product decision, and the reconnect notice bar already covers it.

### IN-04: Reduced-motion tick rate fixed at ticker start

**File:** `src/hotbar/useCooldownTicker.ts:34` (inherited)
**Reason:** Skipped by instruction. The behavior is inherited from the shared cooldown ticker and the review says no change is needed here.

### IN-05: Ticker keeps running while the mobile composer is hidden

**File:** `src/frame/AppFrame.vue:172`
**Reason:** Skipped by instruction. The review itself offers no fix; it is harmless.

### IN-06: Mana-floored cast seen mid-cast measures from first-seen

**File:** `src/action/actionProgress.ts` (`actionStartMicros`)
**Reason:** Skipped by instruction. This is the documented trade-off of not importing `spacetimedb/src/data/combat_scaling.ts`; resolving it needs `resourceType` on `AbilityRow` and a type-check-safe import of the server data module.

### IN-07: The composer grows by 40 px when the row appears

**File:** `src/action/ActionRow.vue`, `src/frame/FeedShell.vue`
**Reason:** Skipped by instruction. It is by design per the plan and needs a UAT check (does the feed keep its scroll anchored), not a code change.

## Gate

- `pnpm exec vitest run --dir src --maxWorkers=2`: 99 files, 1979 tests passed.
- `pnpm exec vue-tsc -b`: clean.
- `pnpm build`: succeeded (only the existing chunk-size warning; `bundle clean: 4 files scanned`).
- Design guards held: no literal colors, `v-html`, `<svg`, `replaceAll`, `.at` or `Object.hasOwn`; no new tokens; no CSS change; `src/module_bindings` and `spacetimedb/` untouched.

## Notes

- `.planning/ROADMAP.md` shows as modified in the working tree. This run did not touch it; it was left alone.
- The untracked Phase 49 and a3d `.planning` files and this report were not added to any commit.

---

_Fixed: 2026-10-06_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
