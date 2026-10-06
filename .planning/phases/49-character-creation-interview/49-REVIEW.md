---
phase: 49-character-creation-interview
reviewed: 2026-10-06T14:28:12Z
iteration: 2
depth: standard
files_reviewed: 53
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
findings:
  critical: 0
  warning: 2
  info: 6
  total: 8
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
