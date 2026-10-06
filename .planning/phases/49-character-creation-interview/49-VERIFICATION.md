---
phase: 49-character-creation-interview
verified: 2026-10-06T14:51:23Z
status: human_needed
score: 13/13 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Live interview run-through on desktop (paid LLM calls). Account with no character: sign in, click a race card, then on a second run choose Surprise me, and on a third type a free-text race. Then pick an archetype card, wait for the staged class reveal, pick an ability card, type a name, press Enter the realm."
    expected: "The step bar follows Race, Archetype, Class, Name, Enter the realm. Every Keeper line is labelled. The sheet fills race, archetype, class, stats with '+N race', racial trait and ability, and shows 'Unnamed' until the name is accepted. Surprise me makes the Keeper invent a race (not a race literally called 'Surprise me'). The frame mounts the moment the first region places the character, and the starter tips show in the first frame feed."
    why_human: "Needs the real Claude executor (paid calls) and a running server; only the unit-level pieces can be checked offline."
  - test: "The same run at 390x844 on a real device or emulator: Sheet chip, cards stacked, keyboard open on the name step."
    expected: "The interview is usable. 'Step n of 5 · label' is shown. The Sheet chip opens the ledger, and Esc or Close returns focus to the chip. With the keyboard open, the step block collapses to its segments."
    why_human: "jsdom tests cover the behavior, but real layout, keyboard and visual fit need a device."
  - test: "Error paths in play: CLASS_FILL_ERROR (Retry class details), Go back a step at archetype or class, Start over at CONFIRMING, and a failed first region (Retry finding a region)."
    expected: "Each button sends its pinned word, and the server takes the matching path (serverWords.test.ts pins the words). The step bar shows the error marker, then recovers."
    why_human: "These failures only happen with a live LLM or world-gen failure."
  - test: "D1 in play: create a race-boosted character, then level up through apply_level_up and through the admin level command."
    expected: "Stats after level-up are the class rebuild plus the stored race bonus. A race with no race_definition levels up exactly as before."
    why_human: "Covered by real-handler unit tests. The owner asked for a milestone-end check against the live database."
  - test: "Owner reviews the checklist items in 49-10-SUMMARY.md: the warning-icon placement, the reconnect gap for event_creation, Pitfalls 3 and 11, the copy wording, the pre-line rule, and the review-fix behavior changes (CR-01 single source, 'Unknown' gets no bonus, the Phase 41 pin change, WR-01)."
    expected: "Owner accepts each one or schedules a follow-up."
    why_human: "Product and balance decisions, deferred to the milestone-end UAT by the owner."
---

# Phase 49: Character Creation Interview Verification Report

**Phase Goal:** A new player is led through character creation as a Keeper interview in the feed (race, archetype, class, then the name last), with a live character sheet that fills in as they choose.
**Verified:** 2026-10-06T14:51:23Z
**Status:** human_needed
**Re-verification:** No. Initial verification.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | (SC1, CRE-01) A player with no character starts a Keeper interview in the feed. Keeper lines are labelled, and a step indicator runs Race, Archetype, Class, Name, Enter the realm, with the name last and no "First words" step. | ✓ VERIFIED | `src/creation/creationSteps.ts` `STEP_LABELS` holds the 5 positions; `STEP_TABLE` maps all 11 server steps, with AWAITING_NAME at position 4 and CONFIRMING at 5. `creationLines.ts` gives labelled Keeper lines per segment. `StepBar.vue` and `CreationFeed.vue` (reusing FeedLine) are composed in `CreationView.vue`. Server order: AWAITING_NAME comes after CLASS_REVEALED (`creation.ts:606`). |
| 2 | (SC2, CRE-03) There are 3 race cards with stat tags. The player can click a card, type a race, or choose Surprise me. | ✓ VERIFIED | `raceCards.ts` `selectRaceCards` takes the newest 3 `race_definition` rows, with tags from the shared `parseRaceBonuses`. `ChoiceBlock.vue` emits `choose(card.sends)`, and `CreationView.choose` calls `creation.send`. At AWAITING_RACE, `creationControls.ts` gives the quick `Surprise me` (sends `'Surprise me.'`) and an unlocked input. The server AWAITING_RACE path takes any free text (`creation.ts:500`). Whether the LLM invents a race for "Surprise me." is listed under human verification. |
| 3 | (SC3, CRE-02) A live sheet fills in race, archetype, class, stats with bonuses, racial trait, then the name ('Unnamed' until then). The class reveal lands in the interview, and after the name the player enters the realm. | ✓ VERIFIED | `sheetModel.ts` `buildSheet` derives everything from the state row. Stats come from `computeCreationStats` with a `+N race` annotation. `CreationSheet.vue` renders `model.name ?? 'Unnamed'`. Entering the realm: finalize sets `player.activeCharacterId` (`creation.ts:314`), and `deriveScreen` holds creation until `activeCharacterPlaced`, then shows the frame. |
| 4 | (SC4) At 390x844 the interview is usable and the sheet is reachable. | ✓ VERIFIED | `CreationView.vue` mobile branch: StepBar with a Sheet chip that opens `<Sheet>` with `CreationSheet variant="sheet"`. `CreationView.mobile.test.ts` sets 390x844 and tests Esc and close focus return, the breakpoint change and keyboard compaction (passing). Visual fit on a real device is listed under human verification. |
| 5 | (Owner) One character per account. The picker has no "New character" button, and creation runs only for an account with zero characters. | ✓ VERIFIED | `CharacterPicker.vue` has no such button; `CharacterPicker.test.ts:128` pins this. The server `start_creation` and `submit_creation_input` still refuse a second character (`creation.ts:374-375`). The client `startReady` requires `characters.length === 0`. |
| 6 | (Owner) The race bonus is applied server-side at finalize: class base plus race bonus. | ✓ VERIFIED | `finalizeCharacter` calls `computeCreationStats(primaryStat, secondaryStat, raceDef?.bonusesJson)` (`creation.ts:199`). This changed from the plan's `state.raceBonuses` to the stored definition per review CR-01, and the state carries the same JSON (`llm_apply.ts:293-303`, `creation_generation.ts:225`). Real-handler tests in `creation_finalize.test.ts` pass. |
| 7 | (D1) The race bonus survives level-up at both sites, and a race with no definition levels up as before. | ✓ VERIFIED | `index.ts:497-499` (`apply_level_up`) and `commands.ts:608-612` (`level_character`) call `levelUpBaseStats(character, newLevel/target, raceDef?.bonusesJson, legacyNow)`. These are the only two class-rebuild sites (grep for `computeBaseStatsForGenerated`). `level_up_race_bonus.test.ts` runs the real handlers for bonus kept, no-definition parity, admin gate and the CR-01 and WR-01 edges, and passes. |
| 8 | (F1) A class with `secondaryStat: 'none'` finalizes instead of throwing. | ✓ VERIFIED | `computeCreationStats` only accepts stat keys (`isStatKey`). The test `creation_finalize.test.ts:110` passes. |
| 9 | One pure helper does the math for finalize, level-up and the client sheet, and the sheet never shows a number the character will not have. | ✓ VERIFIED | `spacetimedb/src/data/race_bonuses.ts` imports only `./class_stats`. The client imports `@game-data/race_bonuses` (`sheetModel.ts`, `raceCards.ts`). The parity test `creation_finalize.test.ts:156` passes. |
| 10 | The screen derivation sends an account with zero characters into creation, never before the characters subscription applies, and an unplaced active character holds at creation. | ✓ VERIFIED | `deriveScreen.ts`: `!charactersApplied` keeps waiting, `characterCount === 0` gives creation, an unplaced active character gives creation. `useSession.ts:323-327` feeds `charactersApplied`, `characterCount` and `activeCharacterPlaced`. `App.vue` renders `CreationView` for `screen.kind === 'creation'`. The table tests in `deriveScreen.test.ts:35-44` pass. `NoCharactersNote.vue` is deleted, with no references left. |
| 11 | The client actually calls the creation reducers (CLAUDE.md checklist) with object syntax, over filtered subscriptions. | ✓ VERIFIED | `creationData.ts` calls `conn.reducers.startCreation({})`, `submitCreationInput({ text: trimmed })` and `setActiveCharacter({ characterId })`. All three exist in `src/module_bindings`. `queries.ts` filters state, events and world gen by `playerId.eq(identity)`. The hub is built in `createDefaultSession` with `creationQueries()` and provided through `CREATION_KEY` in `App.vue`, and `CreationView` injects it and calls `mount()` in `onMounted`. |
| 12 | Starter tips written at finalize before the character is active are not dropped (O3). | ✓ VERIFIED | `src/console/feedStore.ts` holds private rows (`HELD_PRIVATE_CAP = 50`) and replays them on `setCharacter`. The tests at `feedStore.test.ts:518+` pass in the full client run. |
| 13 | The server change is published locally with no clear and no maincloud, the key length is 108 before and after, and the bindings are unchanged. | ✓ VERIFIED | `49-02-SUMMARY.md` and both iterations of `49-REVIEW-FIX.md` record `spacetime publish uwr -p spacetimedb --server local --break-clients`, key_length 108 before and after, and no bindings diff. Independent check: the local `uwr` log shows `Database updated` at 14:19:38Z and 14:42:21Z. The last phase-49 server commit (541dbc56) is at 14:36:20Z, so the running module includes every server fix. |

**Score:** 13/13 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `spacetimedb/src/data/race_bonuses.ts` | Shared race-bonus helper | ✓ VERIFIED | It exports parseRaceBonuses, raceBonusDelta, computeCreationStats, levelUpBaseStats and the MAX constants, plus findRaceDefinition and raceBonusText (review fixes). It is used by creation.ts, index.ts, commands.ts, llm_apply.ts, creation_generation.ts and the client. |
| `spacetimedb/src/reducers/creation_finalize.test.ts` | Finalize pins | ✓ VERIFIED | 10 cases, passing |
| `spacetimedb/src/reducers/level_up_race_bonus.test.ts` | Level-up pins | ✓ VERIFIED | Real handlers, passing |
| `src/creation/creationSteps.ts`, `creationControls.ts`, `serverWords.test.ts` | Step mapping, controls, word pins | ✓ VERIFIED | Used by CreationView and creationData |
| `src/creation/raceCards.ts`, `abilityCards.ts`, `sheetModel.ts` | Card and sheet models | ✓ VERIFIED | Used by CreationView |
| `src/creation/creationLines.ts`, `creationFeedStore.ts`, `src/console/feedStore.ts` | Lines, feed and held rows | ✓ VERIFIED | Ingested from the event binding (`feed.ingest`) |
| `src/creation/queries.ts`, `creationContext.ts`, `creationData.ts` | Session hub | ✓ VERIFIED | Built in createDefaultSession and reset on logout (`useSession.ts:512`) |
| `src/creation/StepBar.vue`, `ChoiceBlock.vue`, `CreationComposer.vue`, `CreationFeed.vue`, `CreationSheet.vue`, `CreationView.vue` | UI | ✓ VERIFIED | All composed in CreationView, which App.vue renders |
| `src/session/deriveScreen.ts`, `useSession.ts`, `src/App.vue` | Entry wiring | ✓ VERIFIED | `kind: 'creation'`, `createCreationData` and `CreationView` all present and wired |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| creation.ts finalizeCharacter | computeCreationStats | stats for the inserted row | WIRED | The argument is `raceDef?.bonusesJson`, not `state.raceBonuses` (an intentional CR-01 change; the state carries the same JSON) |
| index.ts apply_level_up | race_definition + levelUpBaseStats | findRaceDefinition(character.race) | WIRED | |
| commands.ts level_character | race_definition + levelUpBaseStats | same lookup | WIRED | |
| sheetModel.ts / raceCards.ts | race_bonuses.ts | `@game-data/race_bonuses` | WIRED | |
| creationData.ts | conn.reducers.* | object-syntax calls | WIRED | |
| creationData.ts event binding | creationFeedStore.ingest | onRow, identity-checked | WIRED | |
| CreationView.vue | CREATION_KEY hub | `inject(CREATION_KEY, …)`, `mount()` and release | WIRED | |
| CreationView.vue | creation.send | ChoiceBlock `@choose` and Composer `:send` | WIRED | |
| CreationView.vue | frame/Sheet.vue | mobile `<Sheet>` | WIRED | |
| useSession screenInput | deriveScreen | `activeCharacterPlaced` | WIRED | |
| App.vue | CreationView | `v-else-if screen.kind === 'creation'` and `provide(CREATION_KEY, …)` | WIRED | |
| createDefaultSession | createCreationData | `creationQueries()` | WIRED | |
| Retry finding a region ('explore') | server retry | `isExploreText` checked before the step switch for COMPLETE (`creation.ts:409-414`) | WIRED | |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| CreationSheet | `sheetModel` | `buildSheet(creation.state)` from the filtered `character_creation_state` binding | Yes (server row) | ✓ FLOWING |
| ChoiceBlock (race) | `raceCards` | `selectRaceCards(creation.races, racesApplied)` from the `race_definition` binding, attached while mounted | Yes | ✓ FLOWING |
| CreationFeed | `creation.feed.entries` | `event_creation` binding, then `feed.ingest`, plus local echo and errors | Yes | ✓ FLOWING |
| StepBar | `stepView` | `deriveCreationStep(effectiveStep, …)` from the state row and placement | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Whole client suite | `pnpm exec vitest run --dir src --maxWorkers=2` | 115 files, 2392 tests passed | ✓ PASS |
| Type check | `pnpm exec vue-tsc -b` | exit 0 | ✓ PASS |
| Touched server suites | `npx vitest run` race_bonuses, creation_finalize, level_up_race_bonus, creation_generation, llm_apply.characterization, creation_ability_match, llm_apply (in `spacetimedb/`) | 7 files, 409 tests passed | ✓ PASS |
| Running module includes the fixes | `spacetime logs --server local uwr` (read-only) | Last `Database updated` at 14:42:21Z, after the last server commit at 14:36:20Z | ✓ PASS |

### Probe Execution

No probes were declared for this phase, and it is not a migration or tooling phase. Step 7c: SKIPPED.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CRE-01 | 49-03, 05, 06, 07, 08, 09, 10 | Keeper interview in the feed with a step indicator, name last, no First words step | ✓ SATISFIED | Truths 1, 10, 11 |
| CRE-02 | 49-01, 02, 04, 08, 09, 10 | Live sheet: race, archetype, class, stats with bonuses, trait, then the name | ✓ SATISFIED | Truths 3, 6, 7, 9 |
| CRE-03 | 49-04, 06, 07, 09, 10 | 3 race cards with stat tags, free text, Surprise me | ✓ SATISFIED (live LLM behavior of Surprise me is in human verification) | Truth 2 |

There are no orphaned requirements: REQUIREMENTS.md maps only CRE-01..03 to Phase 49, and all are claimed. (REQUIREMENTS.md still marks them "Pending"; the orchestrator updates that.)

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (phase files) | — | TBD/FIXME/XXX/TODO/HACK | — | None found |
| src/creation/* | — | v-html / innerHTML | — | None in production code. Tests assert their absence. |
| spacetimedb/src/reducers/creation.ts | 361 | Resume line says "Four characters minimum", but the rule is 3 to 20 (line 617) | ℹ️ Info | Pre-existing server copy, not touched in this phase. The client hint "3 to 20 letters" matches the real rule. |
| spacetimedb/src/reducers/creation.ts | 12-23, 474 | Substring go-back detection runs at AWAITING_RACE, so a race card whose stored name contains "redo" or "undo" would get a go-back reply instead of picking the race | ℹ️ Info | Pre-existing server limit. Review IN-07 was skipped on instruction, and owner checklist item 5 records the ability-card variant. The player can still type a description or use Surprise me. |
| .planning/.../49-10-SUMMARY.md | checklist item 2 | Says an 'Unknown' race "finalize applies the state's bonus but level-up drops it" | ℹ️ Info | Stale after CR-01/WR-06: finalize now gives no bonus either. Checklist item 11 states the current behavior. |
| spacetimedb/src/data/combat_scaling.ts | 356 | Hybrid scaling's `detectPrimarySecondary` now sees race-boosted stats | ℹ️ Info | A balance side effect the owner accepted, recorded in checklist item 2 |

### Human Verification Required

The owner deferred UAT to the end of the milestone. These items are not gaps.

#### 1. Live interview run-through (desktop)
**Test:** Use an account with no character. Run the interview with a race card, Surprise me and free text (separate runs), then an archetype card, the class reveal, an ability card, a name and Enter the realm.
**Expected:** The step bar follows the order with the name last, and Keeper lines are labelled. The sheet fills in order with "Unnamed" until the name. Surprise me makes the Keeper invent a race. The frame mounts on placement, and the starter tips show in the first frame feed.
**Why human:** It needs paid LLM calls and a running server.

#### 2. The same run at 390x844 on a real device
**Test:** The Sheet chip, stacked cards, and the keyboard open on the name step.
**Expected:** Usable. The chip opens the ledger, and focus returns to the chip. The step block collapses with the keyboard open.
**Why human:** Real layout and keyboard behavior.

#### 3. Error and retry paths
**Test:** CLASS_FILL_ERROR retry, go back, start over, and a failed first region.
**Expected:** Each button's word takes the matching server path, and the step bar shows the error and recovers.
**Why human:** These only occur with a live LLM or world-gen failure.

#### 4. D1 in play
**Test:** Level up a race-boosted character through both level-up paths.
**Expected:** The class rebuild plus the race bonus. A race with no definition levels up as before.
**Why human:** Unit-tested with real handlers. The owner asked for a live check at milestone end.

#### 5. Owner checklist review
**Test:** Review items 2-11 in `49-10-SUMMARY.md`.
**Expected:** Each one is accepted or scheduled.
**Why human:** Product and balance decisions.

### Gaps Summary

There are no gaps. All four roadmap success criteria, CRE-01..03, the three owner decisions (one character per account, race bonus at finalize, D1 level-up carry-through) and each plan's must-haves are present, wired and covered by passing tests. The client really calls `start_creation`, `submit_creation_input` and `set_active_character`. `deriveScreen` sends a zero-character account into creation, only after the characters subscription applies. The local database runs the final server code. The two plan-level deviations are intentional review fixes that keep the goal: finalize reads `race_definition` rather than `state.raceBonuses` (CR-01), and 'Unknown' is reserved (WR-06). What remains is the live LLM and device UAT, which the owner deferred to the end of the milestone.

---

_Verified: 2026-10-06T14:51:23Z_
_Verifier: Claude (gsd-verifier)_
