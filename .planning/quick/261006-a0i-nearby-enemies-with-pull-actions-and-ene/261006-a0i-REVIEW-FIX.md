---
phase: quick-261006-a0i
fixed_at: 2026-10-06T00:00:00Z
review_path: .planning/quick/261006-a0i-nearby-enemies-with-pull-actions-and-ene/261006-a0i-REVIEW.md
iteration: 1
findings_in_scope: 9
fixed: 6
skipped: 3
status: partial
---

# Quick 261006-a0i: Code Review Fix Report

**Fixed at:** 2026-10-06
**Source review:** .planning/quick/261006-a0i-nearby-enemies-with-pull-actions-and-ene/261006-a0i-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 9 (the caller named all but asked three to be left alone)
- Fixed: 6 (in 5 commits; WR-01 and WR-02 share one)
- Skipped: 3 (by owner instruction)

Ran in the main checkout on master (as instructed), not in a worktree. Client only.

## Fixed Issues

### WR-01: Difficulty is color-only for assistive technology

**Files modified:** `src/rails/enemies.ts`, `src/rails/NearbyList.vue`, `src/rails/enemies.test.ts`, `src/rails/ContextContent.test.ts`
**Commit:** fff5acbe (shared with WR-02)
**Applied fix:** `EnemyRow` gets a `pullLabel`, for example `Pull Rotfang (Lv 8, Hard)`. It is used for both `aria-label` and `title` on the Pull button. It drops whatever is not known yet (`Pull Rotfang (Lv 8)` without a player level, `Pull Rotfang` without a template). Nearby tests now query by `[aria-label^="Pull "]`. Requires human verification: logic change (label composition).

### WR-02: Every enemy reads "Even match" while the chained template binding loads

**Files modified:** same as WR-01
**Commit:** fff5acbe (shared with WR-01; the two share the same row derivation and could not be split cleanly)
**Applied fix:**
- `EnemyRow.con` is now `ConView | null`. It is null while the template level or the player level is unknown. The row then has no `con-*` class (neutral styling) and its title is just the name.
- A new `levelKnown` flag keeps the Pull button `aria-disabled`, and the click handler a no-op, until the template level arrives. The button stays visible.
- Tests cover the loading window (no con class, no "Even match", aria-disabled, click sends nothing), the unknown player level (level shown, no difficulty, Pull enabled), a template arriving reactively, and a known same-level enemy still reading "Even match".
- Requires human verification: logic change.

### IN-01: Stale comment says Body pull is in Nearby

**Files modified:** `src/console/useConsole.ts`
**Commit:** 1d77a378
**Applied fix:** The comment now reads "One click is one action: a careful pull, the same as the Nearby Pull button (owner decision)."

### IN-03: Echo text differs from the action label

**Files modified:** `src/console/useConsole.ts`, `src/console/useConsole.test.ts`
**Commit:** ce56118a
**Choice recorded:** Applied. The echo is display only. `routeInput` does not parse echoes, and there is no typed pull command either way. A careful pull now echoes `pull {name}`, matching the visible label. The unreachable body pull echoes `body pull {name}`, so it stays distinguishable. The two pull assertions in `useConsole.test.ts` were updated.

### IN-06: Test gaps

**Files modified:** `src/rails/enemies.test.ts`, `src/rails/ContextContent.test.ts`, `src/game/gameData.test.ts`, `src/console/FeedView.test.ts`
**Commit:** 9c34eafd (the `depleted` fixtures and the loading-window and unknown-player-level tests landed in fff5acbe with the WR-02 tests)
**Applied fix:**
- The real `'depleted'` state replaces the fictional `'gone'` in the `enemyStatus`, `pullableSpawns` and Nearby fixtures. One `'gone'` assertion remains as an extra case.
- The reset test now asserts that `enemiesHere` and `enemyTemplatesHere` are `[]` after `reset()`.
- A new gameData test covers spawns applied with templates not yet applied.
- Nearby tests cover the loading window and the unknown player level (`character: null`).
- A new FeedView test covers an enemy keyword outranking a nearby player with the same name.
- The accessible-name case is covered by the WR-01 label assertions.

### IN-07: Duplicate opacity rule

**Files modified:** `src/rails/NearbyList.vue`
**Commit:** 09fcb818
**Applied fix:** Merged into `.nearby-row.depleted, .nearby-row.in-combat { opacity: 0.45; }`.

## Skipped Issues

### IN-02: `pullType: 'body'` is an unreachable API path

**File:** `src/game/context.ts:248`, `src/console/useConsole.ts:411-418`
**Reason:** skipped by owner instruction. The `'body'` parameter stays in the API.
**Original issue:** `ConsoleApi.pull` keeps a `'careful' | 'body'` parameter that no caller passes as `'body'`.

### IN-04: No client guard for own pending pull, gathering, or the location-swap window

**File:** `src/rails/NearbyList.vue:50`, `src/console/useConsole.ts:411-421`, `src/console/FeedView.vue:35`
**Reason:** skipped by owner instruction. Accepted risk (threat T-a0i-03).
**Original issue:** The client does not block a second pull click while the player's own pull is pending, while gathering, or right after a move.

### IN-05: The client disables pulls the server allows mid-fight

**File:** `src/console/useConsole.ts:414`, `src/console/FeedView.vue:35`, `src/rails/NearbyList.vue:49-55`
**Reason:** skipped by owner instruction. This is an intentional decision.
**Original issue:** The server supports mid-combat pulls, and the client blocks them by design.

## Notes for the orchestrator

- The WR-02 gate (Pull aria-disabled until the level is known) applies to the Nearby Pull button only, as requested. The feed enemy keyword (`pullableSpawns`, `actOnKeyword`) is not gated on the template level.
- Gate: vitest 99 files / 1963 tests passed, `vue-tsc -b` clean, `pnpm build` succeeded (only the existing chunk-size warning, bundle clean).

---

_Fixed: 2026-10-06_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
