---
phase: quick-261006-a0i
reviewed: 2026-10-06T00:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - src/console/FeedLine.test.ts
  - src/console/FeedView.test.ts
  - src/console/FeedView.vue
  - src/console/keywordLabel.ts
  - src/console/keywords.test.ts
  - src/console/keywords.ts
  - src/console/useConsole.test.ts
  - src/console/useConsole.ts
  - src/game/context.ts
  - src/game/gameData.test.ts
  - src/game/gameData.ts
  - src/game/queries.test.ts
  - src/game/queries.ts
  - src/rails/ContextContent.test.ts
  - src/rails/NearbyList.vue
  - src/rails/enemies.test.ts
  - src/rails/enemies.ts
findings:
  critical: 0
  warning: 2
  info: 7
  total: 9
status: issues_found
---

# Quick 261006-a0i: Code Review Report

**Reviewed:** 2026-10-06
**Depth:** standard
**Files Reviewed:** 17. These are the source files changed in 94441144..a01bf4db. The four `.planning/phases/49-*` docs in the diff range came from unrelated commits and were excluded.
**Status:** issues_found
**Revision:** reviewed at commit `a01bf4db` with `git show`. The working tree has concurrent edits from another executor in `context.ts`, `gameData.ts` and `queries.ts`.

## Summary

The feature is wired end to end, and the server contract is used correctly:
- the reducer name and argument object match `start_pull`
- `pullType` is lowercase and in the server's accepted set
- `enemyStatus` is a whitelist: `available`, `pulling`, `engaged`, or any row with `lockedCombatId`

The real server state `depleted` (combat.ts:63) is therefore dropped correctly.

**Text-node safety holds.**
- Names reach the DOM only through `{{ }}` interpolation and attribute bindings (`title`, `aria-label`). Neither file has a raw-HTML directive.
- The img-onerror payload is tested in both Nearby and the feed.
- Keyword matching uses the existing code-point scanner, so no regex is built from a name.

**Subscription scope is correct.**
- `enemy_spawn` is filtered by `location_id`, and the client filter matches.
- The spawn templates are a separate id-list binding with a membership filter, so the Phase 48 fight `enemyTemplates` binding is untouched.
- Both new bindings are in `keyedAll`, so `reset()` disposes them. Disposing `spawns` first empties `spawnRows`, which also nulls `spawnTemplateKey`, so the order is safe.

**Disabled states are mostly correct.**
- Nearby and `ConsoleApi.pull` both guard on offline and on `combat.active`.
- Enemy keywords drop out of the vocabulary in a fight and are aria-disabled offline (FeedLine `disabled`).
- Pulling and engaged rows have no button.

**Design guards hold.** There are no new tokens, sizes or spacing values. All con colors use the existing `--color-con-*` tokens. The vitest run of `enemies`, `keywords` and `FeedLine` passed (61/61).

There are no blockers. The two warnings are both about difficulty information:
- the meaning word is not reachable by assistive technology, which breaks the 48-UI-SPEC rule that color is never the only cue
- the con color and the title confidently claim "Even match" while the chained template subscription is still loading, a window that opens on every arrival at a location

The rest are stale comments, the unreachable `body` path, server-error-only guards, and test gaps.

The owner decision (one Pull button, careful pull) was respected and is not flagged.

## Warnings

### WR-01: Difficulty is color-only for assistive technology (violates 48-UI-SPEC "Color is never the only cue")

**File:** `src/rails/NearbyList.vue:112-123` (also `src/rails/enemies.ts:86`)

**Issue:** 48-UI-SPEC line 137 says: "Color is never the only cue: `Lv N` is always visible next to the name and the `aria-label` carries the meaning word." In the Nearby enemy rows, the meaning word (Trivial … Deadly) appears in only one place: the `title` of a non-focusable `<span class="row-name">`.
- Screen readers do not reliably expose `title` on a plain span.
- Keyboard users cannot reach that span at all.
- The only interactive element, the Pull button, has `aria-label="Pull {name}"`, which has no level and no difficulty.

So a screen-reader user can pull a red-con (Deadly) enemy with no difficulty cue. When the template is missing, `Lv N` is also absent (`levelText` is null), and nothing at all conveys difficulty.

**Fix:** Carry the meaning in the button's accessible name, and keep the visible text unchanged:
```vue
:aria-label="`Pull ${enemy.name}, ${enemy.levelText ? enemy.levelText.replace('Lv ', 'level ') + ', ' : ''}${enemy.con.meaning}`"
:title="`Pull ${enemy.name}`"
```
Alternatively, add an `ariaLabel` field to `EnemyRow` (for example `Goblin Scout, level 8, Hard, 3 in group`) and use it for the button. Then update the `ContextContent.test.ts` assertions that pin `'Pull Goblin Scout'` (line 311 and the PAYLOAD case) to query by `aria-label^="Pull "`.

### WR-02: The chained template binding guarantees a window where every enemy reads "Even match"

**File:** `src/game/gameData.ts:509-518`, `src/rails/enemies.ts:70-73,86`

**Issue:** `spawnTemplateKey` is derived from `spawnRows`, so the template subscription is not even created until the spawn subscription has applied. This happens:
- on every arrival at a new location (with `onApplied` swap, the old templates stay current, and their membership filter excludes the new template ids)
- on first login

In that window, `levels.get()` misses, and `enemyRows` falls back to `conFor(null, 0n)`. That gives every row the class `con-white`, the title `"{name} · Even match"` and no level text. The Pull button is live during this window.

If the template binding fails (the keyed binding then promotes the failed binding, so rows are empty, not stale), this becomes permanent. A Deadly enemy then reads "Even match" with nothing to show that the data is missing.

The 48 spec's "missing template counts as diff 0" rule makes the color defensible, but the title's positive claim "Even match" is false information exactly when the player is deciding whether to pull.

**Fix:** Distinguish "unknown" from "even" in the derived row. Keep the white class (per spec), but do not assert a meaning:
```ts
const known = level !== undefined && input.playerLevel !== null;
const con = known ? conFor(level, input.playerLevel!) : conFor(null, 0n);
...
title: known ? `${spawn.name} · ${con.meaning}` : spawn.name,
```
Optionally, gate the Pull button (or add the hint `Lv ?`) until `enemyTemplatesHere` covers the spawn's template. If `enemyTemplatesHere`'s applied flag is exposed, `pullDisabledAttr` can also consider it.

## Info

### IN-01: Stale comment says Body pull is in Nearby

**File:** `src/console/useConsole.ts:448`

**Issue:** `// ... a careful pull is the cautious choice (Body pull is in Nearby).` Since the owner decision, Nearby has a single careful Pull button, and body pull is not reachable from any UI (SUMMARY Decisions).

**Fix:** Change the comment to `// One click is one action: a careful pull, the same as the Nearby Pull button (owner decision).`

### IN-02: `pullType: 'body'` is an unreachable API path

**File:** `src/game/context.ts:248`, `src/console/useConsole.ts:411-418`

**Issue:** `ConsoleApi.pull` keeps the `'careful' | 'body'` parameter, and `useConsole.test.ts` tests the body path, but no caller passes `'body'`. This is harmless, but it is dead surface that suggests a feature which does not exist.

**Fix:** Either drop the parameter (`pull(enemy)` always sends `'careful'`), or leave a doc comment on `ConsoleApi.pull` stating that `'body'` has no UI entry point today.

### IN-03: The echo text differs from the action label and is not a typable command

**File:** `src/console/useConsole.ts:418`

**Issue:** The button and keyword say "Pull Goblin Scout", but the echo reads `› careful pull Goblin Scout`. Other click-action echoes (`go to X`, `gather X`, `look at X`, `hail X`) mirror commands the player can type. The SUMMARY confirms that `routeInput` has no pull command, so this echo shows a command that does nothing when typed.

**Fix:** Echo `pull ${enemy.name}` to match the visible label. The server line "You begin a Careful Pull on X." already names the pull type.

### IN-04: No client guard for the player's own pending pull, gathering, or the location-swap window

**File:** `src/rails/NearbyList.vue:50`, `src/console/useConsole.ts:411-421`, `src/console/FeedView.vue:35`

**Issue:** `combat.active` stays false through the 1-2 s pull window (`PULL_DELAY_CAREFUL` and `PULL_DELAY_BODY`, combat.ts:50-51), so three cases reach the server.
- **Own pending pull.** While the player's own pull is pending, the other available rows and their keywords stay enabled. A second click, or a double click on the same row before the `pulling` state arrives, produces a duplicate echo plus the server line "Pull already in progress".
- **Gathering.** The same happens while gathering: the server answers "Cannot pull while gathering".
- **Moving.** Right after a move, the `onApplied` swap keeps the previous location's spawns on screen with live Pull buttons. A click there gets "Enemy is not available to pull".

The threat register accepts all three as T-a0i-03, and they match the gather and hail patterns. They are recorded here because the brief asked about disabled-state correctness.

**Fix (optional):**
- Subscribe the player's own `pull_state` (filtered by character) and disable Pull while one is pending.
- Or keep a short local in-flight flag that clears when the spawn's state changes.

### IN-05: The client disables pulls the server allows mid-fight

**File:** `src/console/useConsole.ts:414`, `src/console/FeedView.vue:35`, `src/rails/NearbyList.vue:49-55`

**Issue:** The server's `start_pull` explicitly supports mid-combat pulls (combat.ts:950: "Mid-combat pulling allowed — resolve_pull handles adding to existing fight"). The client blocks them in three places. This follows the plan ("actions are disabled in a fight"). It is noted only so that the divergence is a known decision rather than an accident.

**Fix:** None required. Record it in the SUMMARY or plan decisions if it is meant to be permanent.

### IN-06: Test gaps

**Files:** `src/rails/enemies.test.ts`, `src/rails/ContextContent.test.ts:280`, `src/game/gameData.test.ts:385-397`, `src/console/FeedView.test.ts`

**Issue:** Specific gaps:
- **Fictional state.** The filtered-state tests use a fictional `'gone'` state. The real server state that must be hidden is `'depleted'` (combat.ts:63). Add `'depleted'` to the `enemyStatus` and Nearby fixtures so a future change to a blacklist would be caught.
- **Reset rows.** `disposes both bindings on reset` only asserts that the subscriptions are no longer live. It does not assert that `game.enemiesHere.value` and `game.enemyTemplatesHere.value` are `[]` after `reset()`, which is the logout-visible behavior.
- **Swap window.** No test covers the template swap window (WR-02): spawns applied while the templates are not yet applied, or the old location's templates still current.
- **Ownerless character.** No Nearby test covers `game.character` being null (`playerLevel: null`), which renders every row white.
- **Keyword collision.** No FeedView test covers an enemy keyword colliding with a nearby player's name (enemy outranks player). `keywords.test.ts` covers only npc over enemy and enemy over place.
- **Accessible name.** Nothing asserts the difficulty meaning in an accessible name (see WR-01).

**Fix:** Add the cases above. They are small.

### IN-07: Duplicate opacity rule

**File:** `src/rails/NearbyList.vue:218-224`

**Issue:** `.nearby-row.in-combat { opacity: 0.45; }` repeats the `.nearby-row.depleted` rule directly above it.

**Fix:** Merge them as `.nearby-row.depleted, .nearby-row.in-combat { opacity: 0.45; }`.

---

_Reviewed: 2026-10-06_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
