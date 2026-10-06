---
phase: 49-character-creation-interview
plan: 10
subsystem: client
tags: [vue, session, entry, phase-gate]

requires:
  - phase: 49-02
    provides: "Local publish of the race-bonus server change"
  - phase: 49-06
    provides: "createCreationData hub, CREATION_KEY, createInertCreation"
  - phase: 49-09
    provides: "CreationView"
provides:
  - "AppScreen kind 'creation' and the activeCharacterPlaced input in deriveScreen"
  - "Session.creation: the session-owned creation hub (real bindings in createDefaultSession, reset on logout, disposed with the session)"
  - "App.vue mounts CreationView and provides CREATION_KEY; the Phase 45 no-characters note is deleted"
  - "Phase gate evidence and the deferred owner checklist"
affects: [milestone-end UAT]

tech-stack:
  added: []
  patterns:
    - "Placement is a data fact: activeCharacterPlaced = active character loaded and locationId !== 0n, fed into the pure deriveScreen"
    - "The session builds the hub after the game hub and passes game.llmJobs, so the creation job indicator reads the same my_llm_jobs rows"

key-files:
  created: []
  modified:
    - src/session/deriveScreen.ts
    - src/session/deriveScreen.test.ts
    - src/session/useSession.ts
    - src/session/useSession.test.ts
    - src/App.vue
    - src/App.test.ts
    - src/session/CharacterPicker.test.ts
  deleted:
    - src/session/NoCharactersNote.vue

key-decisions:
  - "An unplaced active character routes to creation only when it is loaded; an active id whose row has not arrived stays on the signing-in splash (and the watchdog still covers it)"
  - "A session without a creation factory carries an inert hub (same fallback pattern as the game hub), so every existing useSession and App test is unchanged"

requirements-completed: [CRE-01, CRE-02, CRE-03]

coverage:
  - id: E1
    description: "Zero characters (after the characters subscription applies) or an unplaced active character shows the creation screen; a placed active character shows the frame; one or more characters with no active id show the picker"
    requirement: CRE-01
    verification:
      - kind: unit
        ref: "src/session/deriveScreen.test.ts; src/session/useSession.test.ts#active character placement"
        status: pass
    human_judgment: false
  - id: E2
    description: "The session owns the creation hub: factory input follows the connection, identity, characters, active character and the game hub's jobs; logout resets it once; dispose disposes it once"
    requirement: CRE-01
    verification:
      - kind: unit
        ref: "src/session/useSession.test.ts#creation hub wiring"
        status: pass
    human_judgment: false
  - id: E3
    description: "App renders CreationView for the creation screen, wires logout, reload and the notice props, provides the hub under CREATION_KEY (inert fallback); the picker has no New character button"
    requirement: CRE-03
    verification:
      - kind: unit
        ref: "src/App.test.ts; src/session/CharacterPicker.test.ts"
        status: pass
    human_judgment: false
  - id: E4
    description: "The live paid run-through of the interview and the visual checks at 900px, 1100px and 390x844 need the owner"
    requirement: CRE-01
    verification:
      - kind: human
        ref: "Deferred owner checklist (milestone-end UAT) below"
        status: deferred
    human_judgment: true
    rationale: "Needs paid LLM calls and a real device; deferred by owner decision to the milestone-end UAT"

duration: 35min
completed: 2026-10-06
status: complete
---

# Phase 49 Plan 10: Entry Wiring and Phase Gate Summary

**A player with no character, or an unplaced active character, now lands in the Keeper creation interview; the session owns and resets the creation hub, App mounts CreationView, the Phase 45 no-characters note is gone, and the full phase gate is green.**

## Tasks and commits

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1. deriveScreen 'creation' kind and session-owned hub | efd13407 | tests written first and run RED (8 failing) before the production change |
| 2. App.vue mounts CreationView; remove NoCharactersNote | fc4102ef | `git rm` of the note; its tests removed with it |
| 3. Phase gate and owner checklist | this SUMMARY | no code change |

## Phase gate results

| Gate | Result |
| ---- | ------ |
| `pnpm exec vitest run --dir src --maxWorkers=2` | exit 0; 115 files, 2378 tests passed (src/styles design guards included) |
| `pnpm exec vue-tsc -b` | exit 0 |
| `pnpm build` (vue-tsc, vite build, bundle guard) | exit 0; 1979 modules, `bundle clean: 4 files scanned` (the chunk-size warning is the existing Vite advisory) |
| `cd spacetimedb && pnpm exec vitest run src/data/race_bonuses.test.ts src/reducers/creation_finalize.test.ts src/reducers/level_up_race_bonus.test.ts src/reducers/llm_cutover.test.ts --maxWorkers=1` | 4 files, 141 tests passed |

The known baseline failures (`scripts/llm/call_log_report.test.mjs`, `scripts/llm/proof_rules.test.mjs`, `spacetimedb/src/helpers/measurement.results.test.ts`) are outside `--dir src` and the four server suites above, so they were not part of this gate. No paid LLM call, publish, push, maincloud action or `--clear-database` was made in Plans 09 and 10.

## Acceptance checks

- `test -f src/session/NoCharactersNote.vue` fails (deleted); `grep -rl "NoCharactersNote" src` prints nothing.
- `grep -c "provide(CREATION_KEY" src/App.vue` prints 1; `grep -c "activeCharacterPlaced" src/session/useSession.ts` prints 1; `kind: 'creation'` is in `src/session/deriveScreen.ts`.

## File ownership check (PATTERNS "Do Not Edit")

Files changed by this phase's commits (`git log --grep="(49-" --name-only --format= | sort -u`, code files only):

- spacetimedb: `src/data/race_bonuses.ts` (+test), `src/index.ts`, `src/reducers/commands.ts`, `src/reducers/creation.ts`, `src/reducers/creation_finalize.test.ts`, `src/reducers/level_up_race_bonus.test.ts`
- client: `src/App.vue`, `src/App.test.ts`, `src/gameDataAlias.test.ts`, `src/console/feedStore.ts`, `src/console/feedStore.test.ts`, `src/session/{CharacterPicker.test.ts, deriveScreen.ts, deriveScreen.test.ts, useSession.ts, useSession.test.ts}`, deleted `src/session/NoCharactersNote.vue`, and every file under `src/creation/` (abilityCards, ChoiceBlock, CreationComposer, creationContext, creationControls, creationData, CreationFeed, creationFeedStore, creationLines, CreationSheet, creationSteps, CreationView (+mobile test), queries, raceCards, serverWords.test, sheetModel, StepBar, with their tests)

Result: none is on the do-not-edit list. `src/console/feedStore.ts` (Plan 05, held private rows replayed on `setCharacter`) is not on the list; the change was a small additive export (`HELD_PRIVATE_CAP`) with the `FeedStore` interface unchanged. The grep also matched the unrelated `.planning/quick/75-.../75-PLAN.md` (a quick-75 merge commit whose message contains the text "(49-"); it is not phase work. `src/game/*`, `src/console/{useConsole,keywords,keywordLabel,FeedView,FeedLine}*`, `src/rails/*`, `src/action/*`, `src/frame/FeedShell.vue`, `spacetimedb/src/helpers/examine.ts`, `spacetimedb/src/reducers/intent.ts` and `src/input/Composer.vue` were never edited, and `src/module_bindings` is unchanged.

## Deviations from Plan

**1. Commit attribution trailer**
- Commits carry `Co-Authored-By: Claude Sonnet 5.5` plus the requested session line.

**2. Type-check ordering**
- As the plan anticipated, Task 1 verified with vitest only (App.vue still compared against the removed kind); `vue-tsc -b` ran after Task 2 and exits 0. The two commits were made back to back so the tree compiles at the end of the plan.

**3. SUMMARY-only docs commit**
- By instruction STATE.md and ROADMAP.md were not edited, so the docs commit contains this SUMMARY only.

Otherwise the plan executed as written.

## Known Stubs

None.

## Threat Flags

None. T-49-34: creation shows only for zero characters or an unplaced active character, and the picker has no New character button (tested). T-49-35: logout calls `creation.reset()` once (tested). T-49-36: creation never shows before the characters subscription applies, and an unloaded active character stays on the signing-in splash with the watchdog (table-driven tests). T-49-37: no live creation, LLM call, publish or push.

## Deferred owner checklist (milestone-end UAT)

1. **D1 (owner decision 2026-10-06): the race bonus survives level-up.** Check: create a character, level up (the `apply_level_up` reducer and the admin level command), and confirm the race-boosted stats keep the bonus. Expected: stats after level-up are the class rebuild plus the race bonus (for example a Saltkin mystic with dex +2, int +1 keeps both). Implemented in Plan 01 (`spacetimedb/src/data/race_bonuses.ts`), unit-tested, published locally in Plan 02.

2. **Drift for characters created before this phase.** They never received the bonus at creation, but their next level-up subtracts the stored race bonus before primary/secondary detection and adds it back, so their stats rise by the bonus and the detected primary or secondary can change. Accepted by the owner as a greenfield trade-off. How to spot it: a pre-phase character whose race has a `race_definition` row with bonuses shows its race-boosted stats jump by +1 to +3 on the first level-up, and a hybrid ability's scaling stat may change. Related edges to know about:
   - A nameless race stored as `Unknown` has no `race_definition` row, so finalize applies the state's bonus but level-up drops it.
   - A race name stored first with different bonuses makes level-up use the stored definition's bonuses.
   - **+STR raises starting max HP:** each point of STR bonus adds 8 max HP at creation. Check: a race with +2 STR starts with 16 more max HP than the same class without it.
   - Hybrid ability scaling (`combat_scaling.ts` `detectPrimarySecondary` on live stats) now sees the bonus.

3. **Warning-icon route.** The go-back warning icon sits in a wrapper beside the Keeper line (`CreationFeed.vue`), not inside the FeedLine label row the UI-SPEC drew. Moving it inside needs a small additive flag on `FeedLine.vue` or `lines.ts`, now possible because the quick tasks have landed. Owner decides; no change made.

4. **Reconnect follow-up.** `event_creation` rows sent while disconnected are lost. A cheap follow-up is to call `start_creation` once more when the status returns to connected while the account still has no character (the server writes a resume line). Left out unless UAT shows a gap: drop the connection mid-interview and check whether the Keeper line after the reconnect is missing.

5. **Pitfall 3 (server limit).** The server's substring go-back detection can turn an ability card whose name contains a go-back phrase (redo, undo, go back, try again, wait no, ...) into a go-back question; the player recovers with Keep my choices. A server fix needs owner approval.

6. **Pitfall 11 (server limits).** Two devices of one account mid-creation could both finalize (finalize does not re-check the one-character rule); a COMPLETE state row survives an admin deleting the character, leaving `start_creation` on the "already created" line.

7. **Live interview run-through (needs paid LLM calls).** Race cards (the local database holds one race, Dark-Elf, so one card shows), Surprise me, free text, archetype cards, staged class reveal, ability cards, CLASS_FILL_ERROR retry if it occurs, go-back, name, Enter the realm, starter tips in the first frame feed, and the same at 390x844 with the Sheet chip. Expected: every step follows the step bar, the sheet fills with the name last, the frame mounts the moment the character is placed, and a failed first region offers Retry finding a region. Also eyeball the visual fit at 900px and 1100px and with a 20-character name.

8. **Copy choices taken from the UI-SPEC checker notes:** `Retry class details`, `Retry finding a region`, `Go back a step`, `Keep my choices`; server texts are shown as sent (UI-SPEC O2). Owner confirms the wording.

9. **Publish evidence.** See `49-02-SUMMARY.md`: local only, `--break-clients`, Anthropic key length 108 before and after, no generated-binding diff, no clear. Maincloud is not published and stays a manual owner step.

10. **49-08 pre-line note.** The plan expected FeedLine's base `.body` to be `pre-line` after quick task a3d, but the file now has `white-space: pre-wrap`. `CreationFeed.vue` keeps the scoped `:deep(.line-keeper .body) { white-space: pre-line }` rule as the UI-SPEC specifies; newlines are kept either way, and pre-line also collapses runs of spaces. Check a Keeper line with a list or blank lines and decide whether to keep the deep rule or drop it. No FeedLine edit was made.

## Self-Check: PASSED

- Files exist: this SUMMARY; `src/session/NoCharactersNote.vue` is absent as intended.
- Commits exist: efd13407, fc4102ef.
