---
phase: 49-character-creation-interview
fixed_at: 2026-10-06T00:00:00Z
review_path: .planning/phases/49-character-creation-interview/49-REVIEW.md
iteration: 1
findings_in_scope: 14
fixed: 12
skipped: 2
status: partial
---

# Phase 49: Code Review Fix Report

**Source review:** `.planning/phases/49-character-creation-interview/49-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 14 (CR-01, WR-01..WR-04, IN-01..IN-09)
- Fixed: 12
- Skipped: 2 (IN-01 and IN-07, skipped on instruction)

All fixes ran in the main checkout on master (not a worktree), because the local publish and the commits had to land on master. No `git stash`, `git checkout -- <file>` or `git reset` was used. `.planning` files are not in any commit.

## Fixed Issues

### CR-01: Finalize and level-up read the race bonus from different sources
**Status:** fixed: requires human verification (logic change)
**Files modified:** `spacetimedb/src/helpers/llm_apply.ts`, `spacetimedb/src/reducers/creation.ts`, plus tests (`creation_finalize.test.ts`, `level_up_race_bonus.test.ts`, `llm_apply.characterization.test.ts` and its snapshot)
**Commits:** 333549ed, follow-up 56f93298 (typing only)
**Applied fix:**
- The stored `race_definition` row is the one source.
- `applyCreationResult` writes an existing definition's name and bonuses onto the creation state, and builds the Keeper bonus line from the stored bonuses.
- `finalizeCharacter` looks the bonus up by `race_definition.by_name(raceName.toLowerCase())`, the same lookup level-up uses. A race with no definition (the `'Unknown'` placeholder) gets no bonus at finalize.
- A reply that named no race now stores `raceBonuses: '{}'` and prints `**Unknown**` with no bonus line, so the sheet matches what finalize adds. The old characterization pin (Unknown with default +2 STR +1 DEX) was updated; this is composed server text, not a prompt, Keeper Bible or route block. No prompt text was touched.
- Tests: finalize with a state/definition mismatch, finalize and two level-ups for a mismatch, and `'Unknown'` finalize and two level-ups.
- Note: a creation state written before this fix (in flight) that carries bonuses but has no definition shows the bonus on the sheet and gets none at finalize. That is rare and the finalize rule is the safe side.

### WR-01: Legacy `race` table stat bonuses were never removed before detection
**Status:** fixed: requires human verification (logic change)
**Files modified:** `spacetimedb/src/data/race_bonuses.ts`, `spacetimedb/src/index.ts`, `spacetimedb/src/reducers/commands.ts`, tests
**Commit:** c5d32030
**Applied fix:**
- `levelUpBaseStats` takes an optional legacy delta that is subtracted before detection and not added to the result.
- Both level-up sites pass `computeRacialAtLevel*(raceRow, character.level)` only when `character.level > 1`. Finalize adds no legacy stats, so a level 1 character has none to remove.
- Pinned with a Human warrior over two level-ups (fails without the fix), an admin 1 to 3 to 6 jump, a Dark-Elf with both a definition and RACE_DATA penalty, and helper-level tests.

### WR-02: An ability card could choose a different ability than the one clicked
**Status:** fixed: requires human verification (logic change)
**Files modified:** `spacetimedb/src/reducers/creation.ts`, new `spacetimedb/src/reducers/creation_ability_match.test.ts`
**Commit:** f78af532
**Applied fix:** the CLASS_REVEALED matcher runs two passes (exact name anywhere, then substring in either direction). The new test pins Frost Bolt vs Frost Bolt Volley and Strike vs Shadow Strike. The new file is a test only.

### WR-03: The defensive `set_active_character` one-shot could fire on the normal finalize path
**Status:** fixed: requires human verification (logic change)
**Files modified:** `src/creation/creationData.ts`, `src/creation/creationData.test.ts`
**Commit:** 3aa16274
**Applied fix:** the watcher confirms `handoffReady` in a `queueMicrotask`; reset and dispose also cancel it. Added tests for the same-burst active id, deferral, and reset/dispose; existing hand-off tests now await the microtask.

### WR-04: Test gaps around the race-bonus math
**Status:** fixed
**Files modified:** `spacetimedb/src/reducers/level_up_race_bonus.test.ts` (plus the tests added under CR-01, WR-01)
**Commit:** a24885af (the other cases landed in 333549ed and c5d32030)
**Applied fix:**
- Covered: state vs definition mismatch, `'Unknown'` leveling twice, a RACE_DATA name (Human, Dark-Elf), and two consecutive level-ups.
- **Mock:** the strict mock (used by these suites) already resolves `by_name` to the declared index column `nameLower` through the recorded schema; only the lenient default mock maps `by_name` to `name`. The shared lenient mock was left untouched on purpose (other suites rely on it). Instead the level-up and finalize seeds use a capitalized display name, and a new test pins the lookup both ways (name matches but nameLower does not: not found; the reverse: found). The stale "mock quirk" comment was removed there.

### IN-02: `aria-label` on a plain span
**Files modified:** `src/creation/CreationSheet.vue`, `CreationSheet.test.ts`
**Commit:** d6e3ecd2
**Applied fix:** the full reading is visually hidden text (`sr-only`, same rule as StepBar); the visible value, annotation and row label are `aria-hidden`.

### IN-03: Choice block inside the polite live log
**Files modified:** `src/creation/CreationFeed.vue`, `CreationFeed.test.ts`
**Commit:** 89c97b5f
**Applied fix:** the slot renders after the `role="log"` element, inside the same scroller (8px top margin).

### IN-04: Unused `computeBaseStatsForGenerated` dep and import
**Files modified:** `spacetimedb/src/index.ts`, `spacetimedb/src/helpers/combat_rewards.ts`
**Commit:** 79c1a496
**Applied fix:** removed the `reducerDeps` entry, the now-unused import in `index.ts`, and the unused import line in `combat_rewards.ts`.

### IN-05: COMPLETE state with zero characters spins forever
**Files modified:** `src/creation/creationContext.ts`, `creationData.ts`, `creationSteps.ts`, `creationControls.ts`, `CreationView.vue`, and tests
**Commit:** a09b13e3
**Applied fix:**
- New hub flag `endedWithoutCharacter` (state COMPLETE, characters applied and empty, no unplaced active character).
- Step 5 shows as stuck (error marker, no spinner), the composer is locked with "No character to enter…", and one feed error line says no character is attached and to log out.
- Existing server behavior only: the server has no restart for a COMPLETE row (`start_creation` answers "already created"), so no restart action is offered. Logging out is the only exit, as before.

### IN-06 and IN-08: Eager inert hub, and focus lost when the mobile sheet closes on a breakpoint change
**Files modified:** `src/creation/CreationView.vue`, `CreationComposer.vue`, `CreationView.mobile.test.ts`
**Commit:** 5225fc30 (both are in `CreationView.vue`, so they share one commit)
**Applied fix:** `inject(CREATION_KEY, () => createInertCreation(), true)`; crossing to desktop with the sheet open now moves focus to the composer input (new `focusInput` expose).

### IN-09: `DARK_ELF` constant seeds a race called Saltkin
**Files modified:** `creation_finalize.test.ts`, `level_up_race_bonus.test.ts`
**Commit:** 333549ed (renamed to `SALTKIN_BONUSES` while those files were being edited for CR-01)

## Skipped Issues

### IN-01: The sheet and finalize disagree when `classStats` is malformed
**File:** `src/creation/sheetModel.ts:62-71,88-94`, `spacetimedb/src/reducers/creation.ts:149-177`
**Reason:** skipped on instruction. The validator always writes valid JSON, so this needs a corrupt row.
**Original issue:** finalize falls back to the archetype pair, the sheet shows flat base plus race bonus.

### IN-07: Race cards can hit the go-back substring rule
**File:** `src/creation/raceCards.ts:87`
**Reason:** skipped on instruction. A fix would need an owner-checklist note and server-matching changes, and the go-back rule is server behavior.
**Original issue:** a stored race name containing `redo` or `undo` is read as a go-back request at AWAITING_RACE.

## Gates (all before the publish)

- Module suite excluding `measurement.results.test.ts`: 82 files, 3798 tests passed.
- `pnpm exec vitest run --dir src --maxWorkers=2`: 115 files, 2388 tests passed.
- `pnpm exec vue-tsc -b`: exit 0.
- `pnpm build`: passed (bundle clean, 4 files scanned).

## Local publish evidence

- Before: `admin_llm_status` key_set true, key_length 108 (server reachable at 127.0.0.1:3000, default server local).
- Ran exactly: `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null`. It reported "Database Migration Plan" with no prompt or refusal and "Updated database with name: uwr".
- After: key_set true, key_length 108, key_valid true.
- `pnpm spacetime:generate -y`: finished successfully, `git status` shows no change under `src/module_bindings`.
- No maincloud, no `--clear-database`, no push, no server started.

---

_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

---

# Iteration 2 fixes

**Source review:** `49-REVIEW.md`, "Iteration 2" section
**Findings in scope:** 6 (WR-05, WR-06, IN-10, IN-11, IN-12, IN-13 second part). Fixed: 6. Skipped: 0.

All fixes ran in the main checkout on master. No `git stash`, `git checkout -- <file>` or `git reset` was used. No `.planning` file is in any commit. No prompt, Keeper Bible or route text was touched.

## Fixed

### WR-05: the no-character notice no longer fires during the finalize burst
**Status:** fixed: requires human verification (logic change)
**Commit:** 84d982f5 (shared with IN-13, same file)
**Files:** `src/creation/creationData.ts`, `creationData.test.ts`
- The `endedWithoutCharacter` watcher now confirms the condition in a `queueMicrotask`, like WR-03. A `resetEpoch` counter makes `reset()` cancel a pending check; `dispose()` cancels it through `disposed`. If the condition has cleared, no error line is added.
- Tests: the burst (state CONFIRMING then COMPLETE, then active id, characters, active character, all synchronous) leaves no error entry; reset and dispose before the microtask add nothing; the existing IN-05 test now awaits the microtask and checks that nothing is posted before it.

### IN-13 (second part): no `start_creation` in the ended state
**Status:** fixed: requires human verification (logic change)
**Commit:** 84d982f5
- `startReady` now also requires `!endedWithoutCharacter`. Test: a COMPLETE row with zero characters, state and events applied, never calls `startCreation`.
- IN-13 first part (record the Phase 41 pin change in the owner checklist) is an owner-checklist item, not a code change. It was not done here: **Phase 41 pin change to record: a reply with no `raceName` used to store "Unknown" with +2 STR, +1 DEX and now stores no bonus.**

### WR-06: the race name "Unknown" is reserved
**Status:** fixed: requires human verification (logic change)
**Commit:** 88c561a9
**Files:** `spacetimedb/src/data/race_bonuses.ts` (new `PLACEHOLDER_RACE_NAME`, `isPlaceholderRace`, `findRaceDefinition`, `raceBonusText`), `helpers/llm_apply.ts`, `reducers/creation.ts`, `index.ts`, `reducers/commands.ts`, and tests (`race_bonuses.test.ts`, `llm_apply.characterization.test.ts`, `level_up_race_bonus.test.ts`)
- A reply that names "Unknown" in any case is treated as naming no race: nothing is saved, the state stores the canonical `Unknown` with `{}` bonuses.
- `finalizeCharacter`, `apply_level_up` and `level_character` look the definition up through `findRaceDefinition`, which returns nothing for the placeholder, even if a row named `unknown` already exists.
- Tests (verified to fail with the guard disabled): reply naming Unknown/unknown/` UNKNOWN ` saves no definition; an already stored `Unknown` row is neither reused nor added to; finalize plus two level-ups, finalize with an `UNKNOWN` state name, both level-up sites, and the helpers.

### IN-10: the existing-definition test tells `name` from `nameLower`
**Commit:** 7388bf85
**Files:** `llm_apply.characterization.test.ts` and its snapshot
- The case runs on the strict mock (`newCtx(seed, sender, true)`) with `name: 'Ashkin'`, `nameLower: 'ashkin'`. It asserts `raceName === 'Ashkin'`. The snapshot now shows `**Ashkin**`.

### IN-11: `reuseRace` prints its bonus line from the stored bonuses
**Commit:** 541dbc56
**Files:** `spacetimedb/src/helpers/creation_generation.ts`, `creation_generation.test.ts`
- Uses `raceBonusText`, the same helper `applyCreationResult` now uses. No invented `+1 DEX` default. The reuse lookup also goes through `findRaceDefinition`.
- Two existing reuse tests seeded a non-stat secondary (`con`), which `parseRaceBonuses` rejects. They now use `int` (the line reads `+2 WIS, +1 INT. Tide-wise`). New tests: invalid or missing secondary, empty and malformed JSON.

### IN-12: focus fallback while the composer input is disabled
**Commit:** 034dc59e
**Files:** `CreationComposer.vue` (`focusInput` returns whether the input took focus), `CreationFeed.vue` (the `role="log"` element gets `tabindex="-1"` and an exposed `focusLog`), `CreationView.vue`, `CreationView.mobile.test.ts`
- When the sheet closes because the viewport became desktop and the input is disabled, focus goes to the story log, not the body. Test uses a GENERATING_RACE state. No new styling (the global `:focus-visible` ring applies).

## Gates (all before the publish)

- Module suite excluding `measurement.results.test.ts`: 82 files, 3815 tests passed.
- `pnpm exec vitest run --dir src --maxWorkers=2`: 115 files, 2392 tests passed.
- `pnpm exec vue-tsc -b`: exit 0.
- `pnpm build`: passed, bundle clean (4 files scanned).

## Local publish evidence

- Before: `admin_llm_status` key_set true, key_length 108, key_valid true (server 127.0.0.1:3000, default server local).
- Ran exactly: `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null`. It showed "Database Migration Plan" with no prompt or refusal and "Updated database with name: uwr".
- After: key_set true, key_length 108, key_valid true.
- `pnpm spacetime:generate -y`: finished; `git status` shows no change under `src/module_bindings`.
- No maincloud, no `--clear-database`, no push, no server started.

_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
