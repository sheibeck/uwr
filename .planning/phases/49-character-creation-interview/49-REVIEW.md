---
phase: 49-character-creation-interview
reviewed: 2026-10-06T14:49:26Z
iteration: 3
depth: standard
files_reviewed: 58
files_reviewed_list:
  - spacetimedb/src/data/race_bonuses.test.ts
  - spacetimedb/src/data/race_bonuses.ts
  - spacetimedb/src/index.ts
  - spacetimedb/src/reducers/commands.ts
  - spacetimedb/src/reducers/creation.ts
  - spacetimedb/src/reducers/creation_finalize.test.ts
  - spacetimedb/src/reducers/level_up_race_bonus.test.ts
  - src/App.test.ts
  - src/App.vue
  - src/console/feedStore.test.ts
  - src/console/feedStore.ts
  - src/creation/ChoiceBlock.test.ts
  - src/creation/ChoiceBlock.vue
  - src/creation/CreationComposer.test.ts
  - src/creation/CreationComposer.vue
  - src/creation/CreationFeed.test.ts
  - src/creation/CreationFeed.vue
  - src/creation/CreationSheet.test.ts
  - src/creation/CreationSheet.vue
  - src/creation/CreationView.mobile.test.ts
  - src/creation/CreationView.test.ts
  - src/creation/CreationView.vue
  - src/creation/StepBar.test.ts
  - src/creation/StepBar.vue
  - src/creation/abilityCards.test.ts
  - src/creation/abilityCards.ts
  - src/creation/creationContext.ts
  - src/creation/creationControls.test.ts
  - src/creation/creationControls.ts
  - src/creation/creationData.test.ts
  - src/creation/creationData.ts
  - src/creation/creationFeedStore.test.ts
  - src/creation/creationFeedStore.ts
  - src/creation/creationLines.test.ts
  - src/creation/creationLines.ts
  - src/creation/creationSteps.test.ts
  - src/creation/creationSteps.ts
  - src/creation/queries.ts
  - src/creation/raceCards.test.ts
  - src/creation/raceCards.ts
  - src/creation/serverWords.test.ts
  - src/creation/sheetModel.test.ts
  - src/creation/sheetModel.ts
  - src/gameDataAlias.test.ts
  - src/session/CharacterPicker.test.ts
  - src/session/deriveScreen.test.ts
  - src/session/deriveScreen.ts
  - src/session/useSession.test.ts
  - src/session/useSession.ts
  - spacetimedb/src/helpers/llm_apply.ts
  - spacetimedb/src/helpers/llm_apply.characterization.test.ts
  - spacetimedb/src/helpers/combat_rewards.ts
  - spacetimedb/src/reducers/creation_ability_match.test.ts
  - spacetimedb/src/helpers/creation_generation.ts
  - spacetimedb/src/helpers/creation_generation.test.ts
  - spacetimedb/src/reducers/intent.ts
  - src/creation/CreationView.mobile.test.ts
  - src/net/bindTable.ts
findings:
  critical: 0
  warning: 0
  info: 2
  total: 2
status: issues_found
---

# Phase 49: Code Review Report

**Reviewed:** 2026-10-06T14:05:00Z
**Depth:** standard
**Files Reviewed:** 49
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

Scope: the Phase 49 race-bonus server change (`race_bonuses.ts`, `finalizeCharacter`, and only the 49-01 level-up hunks in `index.ts` `apply_level_up` and `commands.ts` `level_character`, commits 383a3e87 / 18464629 / bacc6d17), the creation hub and view (`src/creation/*`), the `deriveScreen` and `useSession` wiring, and the `feedStore` held-private-rows buffer (d12870c5). `pnpm exec vitest run src/creation src/session src/console/feedStore.test.ts` passes (24 files, 564 tests).

The client side is well built:
- **Text safety:** there is no `v-html` or `innerHTML`. Every server string, including other players' race names, reaches the DOM as a text node.
- **Subscriptions:** they are filtered on `playerId` and double-checked client-side by identity hex.
- **Start gate:** it waits for the characters, state and event subscriptions to apply, and starts once per mount.
- **Lifecycle:** logout resets, dispose stops every scope and binding, and the `race_definition` binding follows the mount count.
- **Held-rows buffer:** it is capped, dedupes by id, replays through `ingest` (so `acceptRow` and known-key dedupe still apply), and is emptied by `clear()` and by every `setCharacter`.
- **`deriveScreen`:** creation never flashes before `charactersApplied`, and a stale reconnect keeps the creation or frame screen.

The main defect is on the server. Finalize and level-up read the race bonus from **two different sources**. As a result, a character created *after* this phase can have its bonus swapped or dropped at its first level-up, and its class secondary stat can be re-detected wrongly for good. This is not the pre-phase drift the owner accepted. There are three other correctness problems:
- Legacy `race` table stat bonuses are not removed before detection.
- An ability card can pick a different ability than the one clicked.
- The defensive `set_active_character` one-shot can fire on the normal finalize path.

## Critical Issues

### CR-01: Finalize and level-up read the race bonus from different sources, so new characters get a different bonus and the wrong secondary stat at their first level-up

**Files:**
- `spacetimedb/src/reducers/creation.ts:192` reads `state.raceBonuses`.
- `spacetimedb/src/index.ts:495-496` and `spacetimedb/src/reducers/commands.ts:607-609` read `race_definition.by_name(character.race.toLowerCase()).bonusesJson`.
- `spacetimedb/src/helpers/llm_apply.ts:303-321` is the root cause: when the name is already saved, the stored definition is kept but the state keeps the new bonuses.

**Issue:** `finalizeCharacter` adds `state.raceBonuses`. `levelUpBaseStats` subtracts the `race_definition` bonuses for `character.race`. These are different values in two reachable cases. In both, the subtract-then-detect step removes the wrong delta, and `detectPrimarySecondary` sees polluted stats.

1. **LLM-named duplicate.**
   - Player A's description produces "Dark-Elf" with bonuses X, and X is saved.
   - Player B types "dark elf" (with a space). The reuse lookup is by description, `"dark elf" != "dark-elf"`, so it misses, and the model also answers "Dark-Elf", this time with bonuses Y.
   - `applyCreationRaceResult` stores Y on B's state but does not overwrite the definition (`alreadySaved`).
   - The greeting itself suggests `[Dark-Elf]`, and the LLM converges on names, so this is a likely path.
2. **Placeholder race.** A reply with no `raceName` is validated to `'Unknown'` with bonuses but is never saved. Finalize applies the bonus, and level-up finds no definition and subtracts nothing.

Worked example: a warrior with str primary and dex secondary, state bonus Y = cha+3 / wis+2, definition X = dex+2 / int+1.

| Stage | str | dex | cha | wis | int |
| --- | --- | --- | --- | --- | --- |
| Finalized | 12 | 10 | 11 | 10 | 8 |
| Detection input at L2 (minus X) | 12 | 8 | 11 | 10 | 7 |
| Rebuilt at L2, plus X | 15 | 11 | 12 | 9 | 10 |
| Expected at L2 | 15 | 12 | 12 | 11 | 9 |

From the detection input, primary is str and secondary is **cha**. The stored bonus Y is gone, X is applied instead, and dex has lost its secondary status. Every later level-up keeps detecting cha as the secondary. The `'Unknown'` case gives the same misdetection with a zero delta.

This is silent, permanent corruption of a *new* character's class identity. The owner accepted drift only for pre-phase characters. The 49-10 owner checklist mentions the duplicate-name edge only as "uses the stored definition's bonuses" and misses the misdetection.

**Fix:** make one source authoritative for both reads, with no schema change. Make the state match the stored definition whenever one exists:

```ts
// llm_apply.ts, applyCreationRaceResult: after validateRaceReply
const raceLower = namedRace ? race.raceName.toLowerCase() : '';
const existing = raceLower ? [...ctx.db.race_definition.by_name.filter(raceLower)][0] : undefined;
const bonusesJson = existing ? existing.bonusesJson : JSON.stringify(race.bonuses);
ctx.db.character_creation_state.id.update({
  ...s, step: 'AWAITING_ARCHETYPE',
  raceName: existing ? existing.name : race.raceName,
  raceNarrative: race.narrative,
  raceBonuses: bonusesJson,           // finalize and level-up now read the same bonuses
  updatedAt: ctx.timestamp,
});
// Build bonusText from parseRaceBonuses(bonusesJson) so the Keeper line shows what is stored.
```

For the `'Unknown'` placeholder, either skip the bonus at finalize when no definition exists, or save a definition for it. The rule is that finalize must never add a bonus that level-up cannot find.

Add these tests to `level_up_race_bonus.test.ts`:
- Finalize with state bonuses that differ from the stored definition, then level up.
- An `'Unknown'` race leveled up twice.

## Warnings

### WR-01: Legacy `race` table stat bonuses are added after the rebuild but never removed before detection, so the secondary stat is lost for common race names

**Files:**
- `spacetimedb/src/index.ts:499-500,507-511`
- `spacetimedb/src/reducers/commands.ts:596,611-620`
- `spacetimedb/src/data/race_bonuses.ts:109-126`

**Issue:** both level-up sites add `computeRacialAtLevel*(raceRow, level)` stats on top of `levelUpBaseStats`. `raceRow` is the `race` row from `RACE_DATA`, seeded by `ensureRaces` on every init and matched on exact `character.race`. Examples are `Human` with `stat_cha +3` and `Dark-Elf` with a `stat_str` penalty. The next level-up passes those stats straight into `detectPrimarySecondary`, because only the `race_definition` delta is subtracted.

The bug existed before this phase, but it sits in the D1 subtract-then-detect path, and Phase 49 makes it easy to hit:
- The greeting suggests `[Dwarf]`, `[Goblin]`, `[Troll]`, `[Dark-Elf]`, `[Halfling]` and `[Cyclops]`, all of which are `RACE_DATA` names.
- The local database's only `race_definition` row is `Dark-Elf`, the same name as a `RACE_DATA` entry.

Example: a Human warrior with str primary and dex secondary, with no `race_definition` bonus.
- At L2: str 15, dex 12, cha 9 + 3 = 12.
- At L3, detection sees a dex/cha tie at 12, so `secondary` becomes `undefined` and dex stops growing as the secondary.

**Fix:** remove the legacy stat delta that is currently on the character before detection. For example, give `levelUpBaseStats` an extra delta:

```ts
const legacyNow = raceRow ? computeRacialAtLevelFromRow(raceRow, character.level) : null;
const extra = { str: legacyNow?.str ?? 0n, dex: legacyNow?.dex ?? 0n, cha: legacyNow?.cha ?? 0n,
                wis: legacyNow?.wis ?? 0n, int: legacyNow?.int ?? 0n };
const { stats: newBase } = levelUpBaseStats(character, newLevel, raceDef?.bonusesJson, extra);
// inside: detection[k] = character[k] - raceBonus[k] - extra[k]
```

Pin it with a three-level test for a `Human` character.

### WR-02: An ability card can choose a different ability than the one clicked

**Files:**
- `spacetimedb/src/reducers/creation.ts:577-592`, the matcher.
- `src/creation/abilityCards.ts:67`, where `sends: name`.
- `src/creation/ChoiceBlock.vue:88-91`

**Issue:** the card sends the ability name, and the server picks the **first index** for which *either* an exact match *or* a substring match in either direction holds. It does not try every exact match first. 49-RESEARCH.md line 203 describes the matcher as "exact, then substring", which is wrong.

Example: with abilities `["Frost Bolt Volley", "Frost Bolt", ...]`, clicking **Frost Bolt** matches index 0, because `"frost bolt volley".includes("frost bolt")`. With `["Strike", "Shadow Strike"]`, clicking **Shadow Strike** also matches index 0. LLM-generated ability sets often share words.

The wrong ability is written to `chosenAbilityIndex`. The only recovery is Start over, which discards race, class and ability. Typing could always hit this, but the cards now make it deterministic and turn it into a UI promise ("Start with this ability.").

**Fix:** match in two passes on the server. This is a small change to an existing step, not a new step:

```ts
let matchIndex = abilities.findIndex((a: any) => norm(a.name || a.abilityName) === lowerInput);
if (matchIndex === -1) {
  matchIndex = abilities.findIndex((a: any) => {
    const n = norm(a.name || a.abilityName);
    return n !== '' && (lowerInput.includes(n) || n.includes(lowerInput));
  });
}
```

Add a `serverWords.test.ts`-style pin for a shared-prefix pair.

### WR-03: The defensive `set_active_character` one-shot can fire during the normal finalize transaction

**File:** `src/creation/creationData.ts:206-232`

**Issue:** `handoffReady` is watched with `flush: 'sync'` and reads three separate bindings:
- the state step, from `stateKeyed`
- `characters`, from the characters binding
- `activeCharacterId`, from `myPlayer`

Each binding refreshes its rows inside its own SDK table callback. The SDK applies the cache for every table first and then fires the callbacks one table at a time.

The finalize transaction writes `character_creation_state` (COMPLETE), `character` (insert) and `player` (`activeCharacterId`) together. If the `my_player` callback runs after the other two (alphabetical table order would do this), the watcher sees COMPLETE, one character and `activeCharacterId === null` between callbacks, and calls `setActiveCharacter` even though finalize already set it. That reducer:
- appends a `presence` "You are online." line
- notifies friends a second time
- recomputes derived stats

Whether it fires depends on SDK callback order. No test covers that order, because the mocks change one ref at a time.

**Fix:** confirm the condition after the transaction's callbacks have all run, for example:

```ts
watch(handoffReady, (ready) => {
  if (!ready || handoffFired) return;
  queueMicrotask(() => {
    if (!handoffReady.value || handoffFired) return;   // re-check after every table callback ran
    const conn = input.conn.value; const only = input.characters.value[0];
    if (conn === null || only === undefined) return;
    handoffFired = true;
    void callSetActive(conn, only.id);
  });
}, { flush: 'sync' });
```

Add a test that flips step, then characters, then the active id in one synchronous burst and expects no call.

### WR-04: Test gaps around the race-bonus math hide CR-01 and WR-01

**Files:**
- `spacetimedb/src/reducers/level_up_race_bonus.test.ts:58-69,121-170`
- `spacetimedb/src/reducers/creation_finalize.test.ts:90-150`

**Issue:** the level-up tests always seed a definition whose bonuses equal what finalize stored, and they level only once. Nothing covers:
- bonuses that differ between the state and the definition (CR-01)
- an `'Unknown'` race leveling up after finalize applied a bonus
- a race whose name is also in `RACE_DATA` (WR-01)
- stability over two or more consecutive `apply_level_up` calls, where secondary-stat drift appears

The mock also maps `race_definition.by_name` to the `name` column instead of the declared `nameLower` (the documented "mock quirk"). A production lookup on the wrong column would still pass.

**Fix:**
- Add an end-to-end case: confirm through `submit_creation_input`, then run `apply_level_up` twice, and assert the secondary stays the class secondary.
- Add a `Human` (`RACE_DATA`) case and a mismatched-definition case.
- Fix the schema recorder mock to honor the index's `columns`.

## Info

### IN-01: The sheet and finalize disagree when `classStats` is malformed

**Files:** `src/creation/sheetModel.ts:62-71,88-94` and `spacetimedb/src/reducers/creation.ts:149-177`

**Issue:** when `classStats` does not parse or is JSON `null`, finalize falls back to the archetype pair (int/wis or str/dex), but the sheet shows the flat base plus the race bonus. The validator always writes valid JSON, so this only happens with corrupt rows. It still breaks the header's claim that the sheet "never shows a number the character will not have".

**Fix:** move the archetype fallback into a shared helper in `race_bonuses.ts`, used by both the sheet and finalize.

### IN-02: `aria-label` on a plain `<span>` is ignored by most screen readers

**File:** `src/creation/CreationSheet.vue:67-71`

**Issue:** ARIA 1.2 does not allow naming the generic role, so "{stat} {value}, including {N} from your race" is generally not announced. The visible "+N race" annotation is still read as text. The UI-SPEC asked for this label.

**Fix:** use visually hidden text inside the cell, and mark the visible value and annotation `aria-hidden="true"`.

### IN-03: The choice block sits inside the polite live log

**File:** `src/creation/CreationFeed.vue:131,143-145`

**Issue:** `role="log" aria-live="polite" aria-relevant="additions"` wraps the slot, so every time cards appear, screen readers read every card label as new log content.

**Fix:** render the slot after the `role="log"` element, inside the same scroller.

### IN-04: `computeBaseStatsForGenerated` is still passed in `reducerDeps` but no consumer uses it

**Files:** `spacetimedb/src/index.ts:735` and the import at `spacetimedb/src/helpers/combat_rewards.ts:10`

**Issue:** `creation.ts` and `commands.ts` no longer read `computeBaseStatsForGenerated`. The unused import in `combat_rewards.ts` predates this phase.

**Fix:** remove the deps entry and the unused import.

### IN-05: A COMPLETE state with zero characters leaves an endless "Entering the realm…" spinner

**Files:** `src/creation/creationSteps.ts:74,119` and `src/creation/creationControls.ts:214-219`

**Issue:** if an admin deletes the character (Pitfall 11), `deriveScreen` shows creation. The step is COMPLETE, so position 5 shows as working with the input locked. `firstRegionFailed` returns false with no character, so there is no Retry and the only way out is to log out.

**Fix:** when the step is COMPLETE, there is no unplaced active character and there are zero characters, show a short explanatory line instead of the working spinner.

### IN-06: An inert hub is built eagerly on every mount

**File:** `src/creation/CreationView.vue:28`

**Issue:** `inject(CREATION_KEY, createInertCreation())` builds an inert hub (computeds and a feed store) on every mount, even when a hub is provided.

**Fix:** use the factory form, `inject(CREATION_KEY, () => createInertCreation(), true)`.

### IN-07: Race cards can hit the go-back substring rule too (Pitfall 3)

**File:** `src/creation/raceCards.ts:87`

**Issue:** a stored race name containing `redo`, `undo` and so on (for example "Redolent Fae") is read at `AWAITING_RACE` as a go-back request when its card is clicked.

**Fix:** extend the owner checklist note and the `serverWords` pin to race cards.

### IN-08: Focus is lost when the mobile sheet closes on a breakpoint change

**File:** `src/creation/CreationView.vue:98-100`

**Issue:** crossing to desktop sets `sheetOpen = false` directly, so focus falls to `<body>`.

**Fix:** move focus to the composer input, or to the desktop step bar.

### IN-09: A test constant is named `DARK_ELF` but seeds a race called Saltkin

**Files:** `spacetimedb/src/reducers/level_up_race_bonus.test.ts:58` and `creation_finalize.test.ts:54`

**Issue:** the constant name does not match the race it seeds. Because `RACE_DATA` really contains a `Dark-Elf`, a later test author could mix the two up.

**Fix:** rename it to `SALTKIN_BONUSES`.

---

_Reviewed: 2026-10-06T14:05:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

---

# Iteration 2: Re-review after the fix pass

**Reviewed:** 2026-10-06T14:28:12Z
**Depth:** standard, plus cross-file tracing of the changed call chains
**Scope:** commits 333549ed..a09b13e3 (`git diff 333549ed~1 a09b13e3`, 27 files), plus the Phase 49 code those changes touch: `creation_generation.ts` `reuseRace`, `creation_validate.ts` `validateRaceReply`/`cleanName`, `net/bindTable.ts`, `session/useSession.ts`, and the SDK's `#processServerMessage` dispatch in `spacetimedb` 2.10.1.
**Status:** issues_found

## Iteration 2 summary

All of the iteration-1 Critical and Warning findings are fixed. The fix pass introduced two new Warnings.

- **WR-05:** the IN-05 notice is set by a synchronous one-shot watcher, so it can fire during the normal finalize burst. This is the same callback-order hazard that WR-03 fixed with a microtask.
- **WR-06:** finalize now looks the bonus up by race name, so a stored `race_definition` named "Unknown" would also apply to every placeholder race.

No regressions were found in the level-up math, the ability matcher or the a11y changes.

Gates that were re-run read-only:
- `vitest` on the 5 changed module suites: 205 passed. The characterization snapshot has no obsolete entries.
- `pnpm exec vitest run src/creation src/session`: 23 files, 522 passed.

**Prompt, Keeper Bible and route text are unchanged.**
- `git diff 333549ed~1 a09b13e3` touches nothing under `keeper_bible.ts`, `llm_layers.ts`, `llm_routes.ts` or any other prompt or route file. The Bible and layers live in `spacetimedb/src/data/`, not `helpers/`. In `data/`, the diff touches only `race_bonuses*`.
- The only text that changed is the Keeper reply that `applyCreationResult` builds on the server (the bonus line and the race display name). The model never sees that text as a prompt.

## Verification of iteration-1 findings

| ID | Verdict | Evidence |
| --- | --- | --- |
| CR-01 | **Resolved** | See the notes after this table. |
| WR-01 | **Resolved** | See the notes after this table. |
| WR-02 | **Resolved** | `creation.ts:586-595` runs two `findIndex` passes: exact first, then substring. Empty names are skipped in both passes. `creation_ability_match.test.ts` drives the real `submit_creation_input` reducer. |
| WR-03 | **Resolved** | See the notes after this table. |
| WR-04 | **Resolved** | The new cases cover a mismatched definition, Unknown leveled twice, Human and Dark-Elf `RACE_DATA` names, two consecutive level-ups, and the `nameLower` column pin on the strict mock. |
| IN-02, IN-03, IN-04, IN-06, IN-09 | Resolved | The diffs match the stated fixes. No dangling `computeBaseStatsForGenerated` or `detectPrimarySecondary` references remain. |
| IN-05 | Resolved, with a new defect | See WR-05 and IN-13. |
| IN-08 | Mostly resolved | See IN-12. |
| IN-01, IN-07 | Open (skipped on instruction) | Unchanged. |

**CR-01 notes:**
- `applyCreationResult` (`llm_apply.ts:283-300`) now looks up the existing definition before it writes the state. The state takes `existing.name` and `existing.bonusesJson`.
- `finalizeCharacter` (`creation.ts:196-198`) and both level-up sites use the same lookup: `race_definition.by_name(race.toLowerCase())[0]`.
- The Keeper bonus line is built from `parseRaceBonuses(bonusesJson)`, which is the stored value. The dark-elf / Dark-Elf duplicate case now carries X everywhere. The placeholder case carries `{}` everywhere, except for WR-06.

**WR-01 notes:**
- `computeRacialAtLevel*` always gets its stat part from `bonus1 + bonus2 - penalty` and nothing else. No `RACE_DATA` `levelBonusType` is a `stat_*` type (`races.ts`), so the delta does not depend on the level. That makes the different level scaling in `computeRacialAtLevelFromRow` (`level`) and `computeRacialAtLevelForAdmin` (`level/2`) harmless for stats.
- The `character.level > 1n` gate is correct. Finalize adds no legacy delta. Admin `level_character` refuses targets below the current level. `apply_level_up` is the only other path that writes str/dex/cha/wis/int. `recompute_racial_all` updates only the `racial*` fields.

**WR-03 notes:**
- The SDK applies every table in a `TransactionUpdate` and then dispatches all row callbacks synchronously in one loop (`#processServerMessage` → `#dispatchPendingCallbacks`). `bindTable.refresh` runs synchronously inside those callbacks.
- A `queueMicrotask` therefore re-checks only after the whole burst.
- `reset()` cancels a pending check because it clears `handoffArmed`, which forces `handoffReady` to false. `dispose()` cancels it through `disposed`.

## Warnings (iteration 2)

### WR-05: The IN-05 "no character" notice fires during the normal finalize burst and stays in the feed

**File:** `src/creation/creationData.ts:209-226`

**Issue:** `endedWithoutCharacter` reads several separate bindings: `stateApplied`, the state step, `charactersApplied`, `characters` and `unplacedActive`. A `flush: 'sync'` watcher with a one-shot `endedNoticed` flag calls `feed.appendError(...)` the first time the value turns true.

The finalize transaction writes `character_creation_state` (COMPLETE), `character` (insert) and `player` (`activeCharacterId`) in one `TransactionUpdate`. The SDK refreshes each binding in its own table callback, one after another. This is the exact reasoning behind WR-03.

Take a new player whose characters binding has applied with zero rows. If the state callback runs before the character callback, the watcher sees this between the two callbacks:
- `stateApplied`
- COMPLETE
- `charactersApplied`
- `characters.length === 0`
- `activeCharacter === null`, so `unplacedActive` is false

It then appends **"Your creation is already sealed, but no character is attached to this account. Log out to leave this screen."** This happens on the happy path, while the step bar shows "Entering the realm". The computed value turns false again a moment later, but the feed line is permanent, and `endedNoticed` keeps it from being withdrawn.

**Reproduced:** a scratch harness outside the repo (since deleted) used the real `createCreationData`. It set the state to COMPLETE, then `activeCharacterId`, then `characters` and `activeCharacter`, all synchronously. Result: `endedWithoutCharacter` ended `false`, and `feed.entries` held exactly one `error` entry with the text above.

Whether this happens in production depends on the order of the query sets in the server message, which the client does not control. The IN-05 tests never set `charactersApplied` together with a CONFIRMING → COMPLETE burst. The WR-03 burst tests leave `charactersApplied` false, so they cannot catch it.

**Fix:** confirm the condition after the burst, as WR-03 does, and pin it with a burst test:

```ts
watch(
  endedWithoutCharacter,
  (ended) => {
    if (!ended || endedNoticed) return;
    queueMicrotask(() => {
      if (disposed || endedNoticed || !endedWithoutCharacter.value) return;
      endedNoticed = true;
      feed.appendError(ENDED_WITHOUT_CHARACTER_TEXT);
    });
  },
  { immediate: true, flush: 'sync' },
);
```

Add a test that applies the state, sets `charactersApplied = true`, then sets COMPLETE → active id → characters in one synchronous burst, awaits a flush, and expects no error entry.

The same deferral also covers `bindTable.dispose()`, which clears `rows` before `applied`. That leaves another sync window where the binding reports "applied with zero rows".

### WR-06: A stored race_definition named "Unknown" now silently applies to every placeholder race

**Files:**
- `spacetimedb/src/reducers/creation.ts:196-198`, where finalize looks up `finalRace.toLowerCase()`
- `spacetimedb/src/helpers/llm_apply.ts:283-284`, where `namedRace` is true for a literal "Unknown"
- `spacetimedb/src/helpers/llm_apply.ts:326-335`, the insert

**Issue:** under the fix, the placeholder case is consistent only while no definition named "unknown" exists. Nothing prevents one from existing:
- `validateRaceReply` keeps any non-empty `raceName`.
- If the model answers `"raceName": "Unknown"` (a player who types "unknown" or "I don't know" makes this plausible), `namedRace` is true, and `race_definition { name: 'Unknown', nameLower: 'unknown', bonusesJson: <reply bonuses> }` is inserted.

From then on:
1. **Later placeholder replies (no `raceName`):** `applyCreationResult` stores `raceBonuses: '{}'`. It skips the lookup because `raceLower === ''`, so the sheet and the Keeper line show no bonus. But `finalizeCharacter` looks up `'unknown'`, finds the row, and adds its bonus. The sheet and finalize disagree again, which is the defect CR-01 was meant to remove.
2. **Placeholder characters finalized before that row existed (no bonus applied):** at their next level-up, both level-up sites subtract a bonus the character never got before detection, then add it back. This is the same misdetection and bonus swap as CR-01 case 2, in reverse.

The row is permanent, because nothing deletes `race_definition` rows.

**Fix:** reserve the placeholder name in both places.

```ts
// llm_apply.ts
const namedRace = typeof raw?.raceName === 'string' && raw.raceName.trim() !== ''
  && raw.raceName.trim().toLowerCase() !== 'unknown';
// creation.ts finalizeCharacter (and, defensively, both level-up sites)
const raceDef = finalRace.toLowerCase() === 'unknown'
  ? undefined
  : [...ctx.db.race_definition.by_name.filter(finalRace.toLowerCase())][0];
```

Add tests:
- A model reply that names "Unknown" saves no definition.
- With an `unknown` definition seeded, an Unknown character finalizes and levels up with no bonus.

## Info (iteration 2)

### IN-10: The "existing definition" characterization test cannot tell `name` from `nameLower`

**File:** `spacetimedb/src/helpers/llm_apply.characterization.test.ts:432-452`

**Issue:** this test runs on the lenient mock (`by_name` maps to `name`), so the seeded row has `name === nameLower === 'ashkin'`. The new assertion `state.raceName === 'ashkin'`, and the snapshot's `**ashkin**`, would still pass if the code wrote `existing.nameLower`. As a result, the snapshot pins a lowercase display name that production never shows.

**Fix:** move this case to the strict mock, as the level-up suites did, with `name: 'Ashkin'` and `nameLower: 'ashkin'`. Assert `raceName === 'Ashkin'`.

### IN-11: The reuse path still renders its own bonus line with invented defaults

**File:** `spacetimedb/src/helpers/creation_generation.ts:226-234`

**Issue:** `reuseRace` stores the same `existingRace.bonusesJson` that finalize uses. But its Keeper line uses `bonuses.secondary?.value || 1` and `|| 'DEX'` defaults. For a stored row with a missing or invalid secondary, it prints "+1 DEX", while `parseRaceBonuses` (sheet, finalize and level-up) applies nothing. This was not changed in this pass, but there are now two renderers for the same stored bonus.

**Fix:** build the reuse line with the same `parseRaceBonuses` loop as `applyCreationResult`. This is composed server text, not prompt text.

### IN-12: The IN-08 focus move does nothing while the input is locked

**Files:** `src/creation/CreationView.vue:104-109` and `src/creation/CreationComposer.vue:50-53`

**Issue:** `focusInput` is `keepFocus`, which returns early when the input is disabled. That covers every generating step, COMPLETE, and offline. Crossing to desktop with the sheet open during those steps still drops focus to `<body>`.

**Fix:** fall back to a focusable element that is always present, such as the desktop step bar or the feed region with `tabindex="-1"`, when the input is disabled.

### IN-13: Behavior changes that need the owner's acknowledgment

**Files:** `spacetimedb/src/helpers/__snapshots__/llm_apply.characterization.test.ts.snap:1401-1440` and `src/creation/creationData.ts:197-205`

**Issue:**
- The Phase 41 pin changed. A reply with no `raceName` used to give "Unknown" with **+2 STR, +1 DEX**, and now gives no bonus.
  - This fits the D1 "stored bonus" rule.
  - It is still a balance change to a Phase 41 characterization pin.
  - It is composed server text, not a prompt, Bible or route block, so SEG-03 is not triggered.
- In the IN-05 state, `startReady` is still true (zero characters, state applied). So every mount calls `start_creation`, and the server answers "Your character has already been created. Go forth and do something interesting." in the same feed as the client's "...Log out to leave this screen."
- Logging out does not unstick the account. The next login lands on the same screen.

**Fix:**
- Record the Phase 41 pin change in the owner checklist.
- Optionally, gate `startReady` on `!endedWithoutCharacter` so the contradictory server line is not requested.

---

_Iteration 2 reviewed: 2026-10-06T14:28:12Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

---

# Iteration 3: Final re-review after the second fix pass

**Reviewed:** 2026-10-06T14:49:26Z
**Depth:** standard, plus cross-file tracing of every `race_definition` read, the SDK callback burst, and the logout path
**Scope:** commits 84d982f5..034dc59e (`git diff 84d982f5~1 034dc59e`, 17 files), plus the Phase 49 code those changes touch: `creation_validate.ts` `validateRaceReply`/`cleanName`, `start_creation` and the `COMPLETE` case of `submit_creation_input`, `intent.ts` (character info), `raceCards.ts`, `net/bindTable.ts`, and `useSession.ts` `logout`.
**Status:** issues_found (Info only; nothing blocks shipping)

## Iteration 3 summary

All six iteration-2 items are resolved: WR-05, WR-06 and IN-10 to IN-13. No Critical or Warning regressions were found. There are two new Info items:
- **IN-14:** two `race_definition` read sites still bypass `findRaceDefinition`. Only a legacy row named "Unknown" can reach them.
- **IN-15:** the reserved name is still written as a bare `'Unknown'` literal.

Gates were re-run read-only with `CI=true`, so no snapshots were written:
- The 6 changed or adjacent module suites (`race_bonuses`, `creation_generation`, `llm_apply.characterization`, `level_up_race_bonus`, `creation_finalize`, `creation_ability_match`): 252 passed.
- `pnpm exec vitest run src/creation src/session`: 23 files, 526 passed.
- `git status` is clean afterwards.

**Prompt, Keeper Bible and route text are unchanged.**
- `git diff --name-only 84d982f5~1 034dc59e` lists no file under `llm_layers`, `llm_schemas`, `llm_prompts`, `llm_routes`, the Keeper Bible or any other prompt or route module.
- The only text that changed is server-composed Keeper reply text: the reuse bonus line (IN-11) and the canonical `**Unknown**` (WR-06). The model never receives either as a prompt.
- The Phase 41 pin change is recorded in `49-10-SUMMARY.md:173` (owner checklist item 11).

## Verification of iteration-2 findings

| ID | Verdict | Evidence |
| --- | --- | --- |
| WR-05 | **Resolved** | See the notes on the microtask counter. |
| WR-06 | **Resolved** | See the notes on `findRaceDefinition` and `isPlaceholderRace`. IN-14 is a residual for legacy rows only. |
| IN-10 | **Resolved** | The case runs on the strict mock (`newCtx(..., alice, true)`) with `name: 'Ashkin'`, `nameLower: 'ashkin'`. It asserts `raceName === 'Ashkin'`, and the snapshot shows `**Ashkin**` in the message, the segment and the state. Writing `existing.nameLower` would now fail. |
| IN-11 | **Resolved** | `reuseRace` (`creation_generation.ts:229-230`) uses `raceBonusText`, the same helper as `applyCreationResult`. The `|| 1`, `|| 'DEX'` and `|| 'STR'` defaults are gone. New tests cover an invalid secondary, a missing secondary, `{}` and malformed JSON. |
| IN-12 | **Resolved** | See the notes on the `focusLog` fallback. |
| IN-13 | **Resolved** | Part 1 is in the owner checklist. Part 2: `startReady` requires `!endedWithoutCharacter` (`creationData.ts:211-220`). See the notes on the start gate. |

**`findRaceDefinition` and `isPlaceholderRace`, checked at every lookup site:**
- **The helper.** `findRaceDefinition` (`race_bonuses.ts:83-88`) lowercases without trimming, which matches the old lookups exactly. It rejects `''` and anything that `isPlaceholderRace` (trim + lowercase) matches, then returns the first `by_name` row.
- **Server sites that now use it:**
  - `applyCreationResult` (`llm_apply.ts:293`)
  - `startCreationGeneration` reuse (`creation_generation.ts:100`; the description is trimmed first, as before)
  - `finalizeCharacter` (`creation.ts:198`)
  - `apply_level_up` (`index.ts:494`)
  - `level_character` (`commands.ts:608`)
- **All five sites agree:**
  - Finalize and both level-up sites pass the same string (`state.raceName`, later `character.race`).
  - Every `race_definition` insert uses `nameLower = race.raceName.toLowerCase()`, where `cleanName` has already trimmed `raceName`.
  - `namedRace` is false for any spelling of "Unknown". Because `raceLower === ''`, nothing is inserted and nothing is looked up. The state stores the canonical `Unknown` with `{}`.
  - The finalize fallback `state.raceName || 'Unknown'` also resolves to no definition.
- **Remaining raw reads:** `grep race_definition` finds only two, `intent.ts:400` and the client `raceCards.ts`. Both are IN-14.
- **Tests that pin it:**
  - Finalize plus two level-ups with an `Unknown` definition present.
  - An `UNKNOWN` state name.
  - Both level-up sites with the `Unknown`, `unknown` and `UNKNOWN` races.
  - A reuse description of `' Unknown '`.
  - The helper itself.

**The microtask cancellation counter (`resetEpoch`), checked against every path:**
- **Normal finalize burst.** The state, character and player callbacks all run synchronously inside one `#dispatchPendingCallbacks` loop. The microtask re-reads `endedWithoutCharacter` after the loop and finds it false. The WR-05 burst test reproduces this order.
- **Flip in one burst.** If the value goes true, then false, then true, two microtasks are queued. The first posts and sets `endedNoticed`, and the second returns.
- **Logout.**
  - `useSession.logout` runs `disposeBindings()` and then `creation.reset()` synchronously after its only `await`.
  - `bindTable.dispose()` clears `rows` before `applied`, which opens a sync window where the binding reads "applied, zero characters". In that window a microtask can be queued under the old epoch.
  - The microtask is cancelled twice over: `reset()` bumps the epoch, and by then `charactersApplied` is false.
  - `reset()` clears `endedNoticed`, and logout forces the condition false first, so the next sign-in turns it true again and the notice is posted again.
- **Reset while the condition stays true.** If `reset()` were called while the condition stayed true, the notice would not come back, because `watch` fires only on a change. No production caller does this: `reset` is called only from `logout`, after `disposeBindings`. This is not a finding.
- **`dispose()`.** It sets `disposed`, which cancels any pending check for good.

**The `startReady` gate:**
- **No false start in the ended state.**
  - `endedWithoutCharacter` and `startReady` read the same refs. `bindTable` sets `rows` before `applied`, so when `stateApplied` becomes true the COMPLETE row is already visible.
  - So in the ended state `startReady` can never be true even briefly. The IN-13 test delivers the rows before `applied`, as the SDK does.
- **Normal start unchanged.** A new player (no state row) and a resume at any non-COMPLETE step evaluate exactly as before.
- **Nothing lost by skipping the call.** At COMPLETE, `start_creation` and `submit_creation_input` only post "already created" (`creation.ts:364-365, 684-690`). There is no reachable case where skipping the call loses a legitimate start.
- **Finalize burst.** In the burst window the gate is false (ended is transiently true). It already fired for that mount at the earlier CONFIRMING step, so nothing changes.

**The `focusLog` fallback:**
- **Sequence.**
  1. `isDesktop` flips.
  2. `sheetOpen = false`.
  3. `await nextTick()` mounts the desktop branch.
  4. `composer.value?.focusInput()` returns `true` only when the input exists and is enabled.
  5. Otherwise (`false` for a disabled or missing input, `undefined` for a missing composer) `feed.value?.focusLog()` runs.
- **Refs.** The two `ref="feed"` and `ref="composer"` uses are in exclusive `v-if`/`v-else` branches, so each ref names the mounted instance after the tick.
- **The log element.** It is `role="log"` with `tabindex="-1"`, so it is programmatically focusable but outside the tab order. The global `:focus { outline: none }` plus the `:focus-visible` ring means mouse clicks inside the feed show no ring.
- **No focus regressions.** Nothing in `src/creation` reads `document.activeElement`, and the choice block was moved outside the log in IN-03. Clicking feed text now focuses the log instead of `<body>`, which changes nothing that depends on focus.

**The reuse tests whose secondary changed from `con` to `int`:**
- **`con` was never a legitimate stored value.**
  - `STAT_TYPES` is `['str','dex','int','wis','cha']` (`mechanical_vocabulary.ts:21`) and has never contained `con`.
  - The race prompt schema has constrained `"stat": "str|dex|int|wis|cha"` since at least 40-03.
  - Since 41-03 (2026-09-30), `validateRaceReply` clamps every reply to `STAT_TYPES` before anything is stored.
  - Only the pre-41 apply path stored raw model output. A `con`, or an uppercase `"STR"` (`readBonus` is case-sensitive), could exist only in a row from that era where the model ignored the schema.
- **The local database has no such row.** A read-only `spacetime sql uwr "SELECT name, name_lower, bonuses_json FROM race_definition"` returns one row, `Dark-Elf` with `dex`/`int`.
- **The drop is not new.**
  - `parseRaceBonuses` has dropped such a stat at finalize, at both level-up sites, on the sheet and on the race cards since 49-01.
  - Before IN-11, the reuse line still printed "+1 CON". The old test pinned exactly that false promise: a bonus the character never received.
  - The fixture change makes the test use a valid stat, and the new IN-11 test pins that an invalid secondary prints nothing.
- **Impact.** The only effect on a legacy malformed row is that its invalid stat is not applied, which has been true since 49-01 and is consistent everywhere. This is not a finding.

## Info (iteration 3)

### IN-14: Two `race_definition` read sites still bypass `findRaceDefinition`, so a legacy row named "Unknown" is still honored there

**Files:**
- `spacetimedb/src/reducers/intent.ts:398-416` (character info)
- `src/creation/raceCards.ts:74-92` (`selectRaceCards`)
- `spacetimedb/src/data/race_bonuses.ts:73-74` (the doc comment)

**Issue:** the WR-06 doc comment says "no lookup honors a row that has it". The fix stops any *new* `unknown` row from being saved. But pre-Phase-41 code saved any non-empty `raceName`, including "Unknown", so a row can exist in any database that ran that code. Two readers still honor such a row:
1. **Character info.** `intent.ts` filters `race_definition.by_name(character.race.toLowerCase())` directly and prints the raw `bonusesJson`, without `parseRaceBonuses`. For a placeholder-race character, it lists racial bonuses that finalize and level-up never applied (and, for a malformed legacy row, stats such as `con`).
2. **Race cards.** If that row is among the newest three, it is shown as a card such as "Unknown, +2 STR. Choose this race." Clicking it sends "Unknown". `findRaceDefinition` refuses the placeholder, so instead of the promised reuse with no model call, a paid `creation_race` job runs. The likely reply ("Unknown") ends with no bonus, which contradicts the card.

The local database has no such row (checked above), so this does not occur locally. Maincloud has not been checked.

**Fix:**
- In `intent.ts`, use `findRaceDefinition(ctx, character.race)`, and render the bonus lines with `raceBonusText` / `parseRaceBonuses`.
- In `selectRaceCards`, skip rows where `isPlaceholderRace(row.name)` before the slice (`race_bonuses.ts` is already reachable through `@game-data`).
- Or narrow the doc comment to "no server stat lookup".

### IN-15: The reserved placeholder name is still a bare literal in the places that produce it

**Files:**
- `spacetimedb/src/reducers/creation.ts:197` (`state.raceName || 'Unknown'`)
- `spacetimedb/src/helpers/creation_validate.ts:116` (`cleanName(d.raceName, 'Unknown')`)
- `spacetimedb/src/helpers/creation_generation.ts:110,156`

**Issue:** `PLACEHOLDER_RACE_NAME` is now the reserved name, but the code that *produces* the placeholder still hard-codes `'Unknown'`. If the constant changes, `validateRaceReply` would produce a name that `isPlaceholderRace` no longer recognizes, and the reservation would silently stop applying. This is not a bug today.

**Fix:** import `PLACEHOLDER_RACE_NAME` at the race-name sites, at least `creation.ts:197` and `creation_validate.ts:116`. Note that `creation_validate.ts` has its own import constraints, so check its import pin first.

---

_Iteration 3 reviewed: 2026-10-06T14:49:26Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
