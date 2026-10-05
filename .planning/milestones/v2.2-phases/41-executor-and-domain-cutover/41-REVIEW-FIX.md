---
phase: 41-executor-and-domain-cutover
fixed_at: 2026-09-30T20:14:10Z
review_path: .planning/phases/41-executor-and-domain-cutover/41-REVIEW.md
iteration: 2
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 41: Code Review Fix Report

**Fixed at:** 2026-09-30T20:14:10Z
**Source review:** .planning/phases/41-executor-and-domain-cutover/41-REVIEW.md
**Iteration:** 2 (the iteration 1 report is saved as 41-REVIEW-FIX.iter2.md)

**Summary:**
- Findings in scope: 4 (critical CR-B01; warnings WR-B01, WR-B02, WR-B03). Part A had Info findings only, so nothing from it was in scope.
- Fixed: 4
- Skipped: 0

**Verification:**
- Full server suite: `CI=true pnpm --dir spacetimedb exec vitest run --maxWorkers=1` passed 2161 of 2161 (baseline 2144, plus 17 new tests).
- No client files changed, so the root suite was not rerun.
- `pnpm build` passed.
- `tsc --noEmit -p spacetimedb` reported the same 236 errors as before the fixes. All of them were already there.
- Published locally with `pnpm spacetime:publish`. There was no migration plan and the database was not cleared.
- `pnpm spacetime:generate -y` left `src/module_bindings` unchanged, because the public surface did not change.

**Process note:** All work was done in the main working tree on `master`, with one `git commit` per fix, as the caller's project rules ask. The isolated worktree was not used, because it has no `node_modules`. The tests, the build and the local publish all need them.

## Fixed Issues

### CR-B01: Renown offers for two ranks coexist, and choosing one rank's perk deletes the other rank's options

**Files modified:** `spacetimedb/src/helpers/renown.ts`, `spacetimedb/src/reducers/renown_perk.ts`, `spacetimedb/src/helpers/llm_apply.ts`, `spacetimedb/src/helpers/renown_llm.test.ts`, `spacetimedb/src/helpers/__snapshots__/submit_llm_result.characterization.test.ts.snap`
**Commits:** 668bd70b, 3022e523 (snapshot refresh)
**Status:** fixed: requires human verification (logic change)

**Applied fix:**
- **Choosing a perk.** `chooseRenownPerkLogic` now deletes only the chosen rank's `pending_renown_perk` rows.
- **Serialized offers.** New helper `renownOfferOutstanding` is true while pending options of any rank exist, or while an active `renown_perk_gen` job exists. In that case `triggerRenownPerkGeneration` returns `'deferred'` and enqueues nothing. `awardRenown` then posts a system line: "Your rank N reward will be offered once you choose your earlier renown reward."
- **Next offer after a choice.** New helper `offerNextRenownPerk` runs after every choice. It offers the lowest earned rank that is not yet claimed, so crossing two ranks bills one call at a time and no rank is lost. It skips a rank that produces no offer.
- **No stacking.** New helpers `renownRankClaimed` (a `renown_perk` row, or a Renown ability keyed `renown_rank<N>_...`) and `renownRankSettled` (claimed, or already pending) guard `applyRenownPerkResult` and `insertStaticRenownPerkOptions`. Neither can stack options on a rank that is pending or claimed.
- **Tests.**
  - Two existing tests are updated on purpose, because two ranks now wait instead of enqueueing two jobs.
  - New tests cover:
    - crossing two ranks, then apply, choose, apply and choose, with no rank lost;
    - reaching rank 3 while the rank 2 options are pending;
    - legacy data where two ranks are pending, choosing one keeps the other;
    - apply on a rank that is pending or claimed;
    - a rank claimed as an ability.
- **Snapshots.** The characterization snapshots only gained empty `ability_template`, `renown_perk` and `pending_renown_perk` arrays, which come from the new reads.

### WR-B01: The second-device first-region retry works only if the first line is `explore`

**Files modified:** `spacetimedb/src/reducers/creation.ts`, `spacetimedb/src/reducers/llm_cutover.test.ts`
**Commit:** 61a5a28f
**Status:** fixed: requires human verification (logic change)

**Applied fix:** `submit_creation_input` looks for a stranded character (location 0) before it auto-starts a creation. This applies when there is no creation state, at `COMPLETE`, and at `AWAITING_RACE`.
- `explore` or `[explore]` goes to the first-region retry. At `AWAITING_RACE`, the word is therefore never billed as a race description.
- With no creation state, any other line gets `STRANDED_CHARACTER_HINT` and no second creation is started. The hint is the existing `COMPLETE` line, now a shared constant: "Your character has already been created. If the world has not taken shape around you, type [explore]."
- New tests:
  - A second identity sends `hello`: the hint appears, no creation state is created and nothing is reserved. It then sends `explore`, and the world_gen job starts under that identity.
  - `[explore]` at `AWAITING_RACE` starts the retry and bills no `creation_race`.

### WR-B02: After a quick double level-up, nothing leads the player to the level N+1 skill offer

**Files modified:** `spacetimedb/src/helpers/skill_offer.ts`, `spacetimedb/src/index.ts`, `spacetimedb/src/helpers/skill_offer.test.ts`, `spacetimedb/src/reducers/llm_cutover.test.ts`
**Commit:** 4366565f
**Status:** fixed: requires human verification (logic change)

**Applied fix:**
- **Offer level.** New helper `owedSkillOfferLevel` picks the level for an offer. It is the current level when no generated ability was taken at it. Otherwise it is the lowest earlier level (from 2) that has none. Rule 4 is now "some level from 2 to the current one is still owed". `enqueueSkillOffer` takes that level for the prompt input, the source key and the job's `level`.
- **Offer after a choice.** `choose_skill` calls the new `offerNextOwedSkill` in the same transaction and posts its line. This is the created narrative, or a refusal that says to ask again with `[skills]`. When nothing is owed, it posts nothing.
- **Covered cases.** A double level-up now offers level 3 as soon as level 2 is chosen. A level 2 offer that failed while the character was already level 3 is recovered: `[skills]` offers 3, and choosing from it offers 2.
- **Wording.** The duplicate line now reads: "The Keeper is already preparing an offering. Once you choose from it, any further offering you are owed follows."
- **Tests.** The existing expectations for the wording and for rule 4 are updated on purpose. New tests cover `owedSkillOfferLevel`, `offerNextOwedSkill`, both `choose_skill` flows through the real reducer, and the rule 4 refusal.
- **Side effect.** A character who has earlier levels with no generated ability is now offered those levels one at a time, after a choice or through `[skills]`. This follows the one-offer-per-level design in the module header.

### WR-B03: The renown validator drops perks whose `effectType` the prompt never constrains

**Files modified:** `spacetimedb/src/data/llm_layers.ts`, `spacetimedb/src/data/llm_layers.test.ts`, `spacetimedb/src/helpers/llm_apply.ts`, `spacetimedb/src/helpers/llm_apply.test.ts`, `spacetimedb/src/helpers/__snapshots__/claude_request.test.ts.snap`
**Commit:** ac34b57e
**Status:** fixed

**Applied fix:**
- **Prompt.** `RENOWN_PERK_BLOCK` now lists `- effectType (for buff, debuff, dot, hot): ${EFFECT_LIST}`, the same line the skill route has.
- **Validator.** `validateRenownActivePerk` changes an unknown `effectType` to `damage_up` (skill_gen's default) instead of dropping the perk. Other invalid enums still drop it. Those are the kind, targetRule, resourceType, scaling and damageType, all of which the schema constrains.
- **Schema left alone.** The JSON schema is unchanged, on purpose. `EFFECT_TYPES` contains `stun`, which the vocabulary test forbids in schema enums. Leaving the schema alone also keeps the compiled-grammar cache and the Phase 40 cache layout: the same blocks and breakpoints, with only the renown route block text changed.
- **Snapshot.** Only the `renown_perk_gen` body snapshot changed, by the one added line.
- **Tests.**
  - A buff perk with `effectType: 'defense_up'` is kept, defaulted to `damage_up` and clamped, and it does not trigger the static fallback.
  - `validateRenownActivePerk` defaults an unknown value and keeps a valid one.
  - The renown and skill route blocks both list every effect type.

---

_Fixed: 2026-09-30T20:14:10Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
