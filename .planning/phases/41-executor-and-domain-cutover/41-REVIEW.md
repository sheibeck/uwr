---
phase: 41-executor-and-domain-cutover
iteration: 3
reviewed: 2026-09-30T20:25:42Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - spacetimedb/src/helpers/renown.ts
  - spacetimedb/src/reducers/renown_perk.ts
  - spacetimedb/src/helpers/llm_apply.ts
  - spacetimedb/src/reducers/creation.ts
  - spacetimedb/src/helpers/creation_generation.ts
  - spacetimedb/src/helpers/world_gen.ts
  - spacetimedb/src/helpers/skill_offer.ts
  - spacetimedb/src/helpers/skill_gen.ts
  - spacetimedb/src/index.ts
  - spacetimedb/src/reducers/intent.ts
  - spacetimedb/src/data/llm_layers.ts
  - spacetimedb/src/helpers/llm_executor.ts
  - spacetimedb/src/helpers/llm_sweeper.ts
findings:
  critical: 0
  warning: 1
  info: 24
  total: 25
status: issues_found
---

# Phase 41: Code Review Report (iteration 3, final)

**Reviewed:** 2026-09-30T20:25:42Z
**Depth:** standard, plus targeted tracing into `reducers/renown.ts`, `helpers/combat_perks.ts`, `helpers/combat.ts`, `helpers/llm_queue.ts`, `data/renown_data.ts` and `src/composables/useRenownPerks.ts` / `useCharacterCreation.ts`
**Files Reviewed:** 13
**Status:** issues_found

Previous iteration: `41-REVIEW.iter3.md`. Fix report: `41-REVIEW-FIX.md`. The fix commits under review are 668bd70b and 3022e523 (CR-B01), 61a5a28f (WR-B01), 4366565f (WR-B02) and ac34b57e (WR-B03).

## Summary

All four iteration-2 findings are resolved on the paths players actually use. The fixes introduce no new Critical or Warning defect. The targeted suites pass: `renown_llm`, `skill_offer`, `llm_cutover` and `llm_apply` ran 205 of 205 at `--maxWorkers=1`.

`llm_executor.ts` and `llm_sweeper.ts` have not changed since 41765023, which the previous iteration reviewed. The iteration-1 fixes (WR-A01 to WR-A05) therefore still hold, and the Part A Info items carry forward unchanged.

One Warning is new to this review. It was **not introduced by Phase 41**; it dates from Phase 36. It sits right under the renown fix, though. Every passive renown perk chosen through the client does nothing mechanically, and so does every static-fallback active perk. The CR-B01 guarantee that "an earned perk offer is never lost" therefore delivers an offer whose reward is often inert (WR-B01 below).

### Prior findings: resolution

| Prior | Verdict | Evidence |
|---|---|---|
| CR-B01 (two renown ranks collide, one is lost) | **Resolved** | `chooseRenownPerkLogic` deletes only `row.rank === perk.rank` (`renown_perk.ts:85-89`). `triggerRenownPerkGeneration` returns `'deferred'` while any pending option or active `renown_perk_gen` job exists (`renown.ts:147-149`), so crossing ranks 2 and 3 in one award bills only one call. `offerNextRenownPerk` runs after every choice and offers the lowest unclaimed rank (`renown.ts:106-118`). `applyRenownPerkResult` and `insertStaticRenownPerkOptions` both refuse a settled rank (`llm_apply.ts:805-808`, `renown.ts:226`). Every rank from 2 to 15 has a pool (`renown_data.ts:93-464`), so the chain never stalls on an empty pool. Renown is exempt from the busy cap, and a budget refusal falls back to static options inside the same choice transaction, so a choice is never rolled back by the chained enqueue. |
| WR-B01 (second-device retry hijacked by the auto-start) | **Resolved** | `creation.ts:393-405`: with no creation state and a stranded character, any line gets `STRANDED_CHARACTER_HINT`, and no second `AWAITING_RACE` is inserted. `explore` retries the first region with no state, at `COMPLETE` and at `AWAITING_RACE`, so the word is never billed as a race. `retryStarterWorldGen` finds starter states by character, so identity B can retry identity A's `ERROR` state. The `COMPLETE` branch reuses the same constant. |
| WR-B02 (no path to the level N+1 skill offer) | **Resolved** | `owedSkillOfferLevel` (`skill_offer.ts:77-89`) prefers the current level, then the lowest owed level from 2 up. `choose_skill` calls `offerNextOwedSkill` after it deletes the pending rows (`index.ts:489-491`). A refusal there is posted as a private `system` event, not through `fail`, so the choice itself always commits. Only `choose_skill` (with `levelRequired = pending.levelRequired`) writes generated abilities at level 2 or higher. Creation and renown abilities use `levelRequired: 1n` and are ignored. An offer therefore fills exactly one owed level, and nothing can be farmed: no reducer deletes `ability_template` rows. The new `duplicate` line is accurate. |
| WR-B03 (the renown validator is stricter than the prompt) | **Resolved** | `RENOWN_PERK_BLOCK` now lists `effectType` (`llm_layers.ts:331`). `sanitizeEffectType` defaults an unknown value to `damage_up` before `validateSkillFields` runs (`llm_apply.ts:760, 789-793`), so an invented effect type no longer discards a billed reply. |

### What was checked in the new code

- **Renown double billing.** One award crossing ranks 2 and 3 gives one job for rank 2, and rank 3 gets the deferred line. After the rank 2 choice, one job runs for rank 3. `hasActiveJobForCharacter` matches on `characterId`, not identity, so a second device cannot open a parallel offer. The dedupe key includes the rank, and it can only be hit while `renownOfferOutstanding` is already true.
- **Renown claimability.** A pending row can be chosen for any rank. `renownRankClaimed` matches `renown_rank<R>_` with the trailing underscore, so rank 1 never matches rank 12. `ability_template.by_character`, `source` and `abilityKey` exist in the schema (`tables.ts:632, 655-656`).
- **Skill chain transaction order.** In `choose_skill` the order is: insert the ability, assign the hotbar slot, delete the pending rows, post the narration, then call `offerNextOwedSkill`. `canRequestSkillOffer` reads `ability_template` again, so it sees the ability that was just inserted. The job is billed to `ctx.sender`, and `archetypeForCharacter` resolves across all of the user's identities (the WR-B04 fix).
- **Pronoun rule in the new strings.** `renownDeferredMessage`, `STRANDED_CHARACTER_HINT` and `SKILL_OFFER_MESSAGES.duplicate` address the player as "you". The only "it" in them refers to the offering, not to a person. No NPC or Keeper line was added.
- **Executor and sweeper (quick pass).** `withFailureTx`, the stale-branch ledger swap, `keyVersionMicros` gating and `billedButUnparsed` are unchanged. The sweeper's pending rule (24 h for renown) interacts safely with serialization: an expired renown job goes through `notifyFailure`, then the static options, and those unblock the chain.

## Warnings

### WR-B01: Passive renown perks chosen through the client, and static-fallback active perks, have no mechanical effect

*(new to this review; pre-existing since Phase 36 (f3cb56e0), not a Phase 41 regression)*

**Files:**
- `spacetimedb/src/reducers/renown_perk.ts:46-47, 73-81`
- `spacetimedb/src/helpers/renown.ts:200-201, 229-249, 318-330, 350-360`
- `spacetimedb/src/helpers/combat.ts:918-925`
- `spacetimedb/src/data/llm_layers.ts:317`

**Issue:**
- **Passive perks.** `chooseRenownPerkLogic` stores a passive perk as `perkKey = renown_rank<R>_<sanitized name>`, for example `renown_rank2_iron_will`. Every consumer of `renown_perk` (`getPerkBonuses`, `getPerkProcs`, `getPerkBonusByField`, and the combat perk check in `combat_perks.ts:178-186`) looks the key up in `RENOWN_PERK_POOLS`, whose keys are bare (`iron_will`). The lookup never matches.
  - A static "Iron Will" chosen through `choose_renown_perk`, the only reducer the client calls (`useRenownPerks.ts:47`), grants no HP and no Strength.
  - An LLM-generated passive is worse. Its `perkEffectJson` is never read, and it is discarded when the pending row is deleted: `renown_perk` has no column for it. The generated effect is therefore lost for good.
- **Static-fallback active perks.** `insertStaticRenownPerkOptions` inserts them as `kind: 'utility'` with `value1: 0n`. `chooseRenownPerkLogic` turns that into an ability whose use only logs "You use X." (`combat.ts:918-925`). The real effect, such as `healPercent`, lives in `combat_perks.ts` behind a `perk_<key>` ability and a matching `renown_perk` row, and neither is created.
- **The prompt and the docs.** The renown prompt requires at least one passive per offer, promising "they just work" (`llm_layers.ts:317`). So every billed renown offer includes at least one option that does nothing if picked. The Phase 41 comment on `serializePerkEffect` (`renown.ts:200-201`) states that chosen passives are looked up by `perkKey` in `RENOWN_PERK_POOLS`, which is not true for this path.

This is not Critical for this phase: Phase 41 did not introduce it, the project is greenfield with no player data, and it has no security impact. It does mean the "reward never lost" guarantee that CR-B01 was built around is hollow for most perk types.

**Fix:** Carry a stable key on the pending row and use it when the perk is chosen.
- Store the pool key when the static options are inserted, for example in a new `pending_renown_perk.perkKey` column or in `perkEffectJson`.
- In `chooseRenownPerkLogic`, write `renown_perk.perkKey = <pool key>` for static perks. For a static active perk, write the `renown_perk` row and let the existing `perk_<key>` path handle it, as `choose_perk` does, instead of inserting a `utility` template.
- For generated passives, persist the validated effect: add an `effectJson` column to `renown_perk`, and have `getPerkBonuses` and `getPerkBonusByField` read it when the pool lookup misses. Clamp every field against a per-rank budget first.
- Correct the `serializePerkEffect` comment.
- Add a test: choose static "Iron Will" through `chooseRenownPerkLogic`, then check that `getPerkBonuses(...).maxHp === 25n`.

If this is deferred, record it as a todo for Phase 42 or 43.

## Info

### Part A (carried from 41-REVIEW.iter3.md; files unchanged since 41765023)

- **IN-A01**: `realCost` is computed from the raw `usage`, so a non-finite count makes `BigInt` throw before persist (`llm_executor.ts:357`). Compute it from the clamped `counts`.
- **IN-A02**: `confirmKeySet` can match a log line left by an earlier key set (`scripts/llm/cli.mjs:133-142, 166`).
- **IN-A03**: `phaseCalls` counts jobs and drops on refunds of calls that were probably billed (`llm_budget.ts:147, 175, 183`).
- **IN-A04**: an Anthropic `billing` failure still clears `keyLastCheckOk` on a working key (`llm_executor.ts:503`).
- **IN-A05**: the sweeper writes money before the job status, so a failed job write charges twice (`llm_sweeper.ts:157-168`).
- **IN-A06**: a job with an unknown route throws in `timeoutMicros` and is never swept (`llm_sweeper.ts:89-91`).
- **IN-A07**: `isSmokeRequest` is still duplicated in three modules (`llm_executor.ts:123-129`, `llm_sweeper.ts:81-87`, `reducers/llm.ts:13-20`).
- **IN-A08**: a late non-2xx reply keeps the sweeper's stand-in charge, so `llm_call_log` and the ledger disagree (`llm_executor.ts:386-394`).
- **IN-A09**: smoke results from a key used before a rotation still read "ok", and the runbook treats six "ok" results as proof the key is valid (`llm_executor.ts:458-464`, `docs/runbooks/llm-key.md`).
- **IN-A10**: when a failure message throws, only creation and world-gen get a recovery path (`llm_executor.ts:177-181`). **Now wider:** with renown serialized, a `renown_perk_gen` job that ends this way leaves no options and no active job. Every rank deferred behind it then waits for the next rank-up, and at rank 15 there is none, so those rewards are lost. The fix is the same as before: a sweep rule that inserts the static options for a terminal renown job whose rank is not settled, then calls `offerNextRenownPerk`.
- **IN-A11**: the creation lock holder is matched by (route, playerId), not by the job's `creationStateId`, so an admin smoke job can delay the admin's own lock release (`llm_sweeper.ts:276-290`).

### Part B (carried from 41-REVIEW.iter3.md)

- **IN-B01**: `data/llm_prompts.ts` is still dead code. `sendNarrationSkippedMessage` and the stale "triggerCombatNarration" comment also remain (`combat_narration.ts:227`, `llm_apply.ts:738`).
- **IN-B02**: every successful apply still writes the dead `LlmBudget` table through `incrementBudget` (`llm_apply.ts:19` and its call sites).
- **IN-B03**: swallowing narration errors can commit a partial enqueue (`combat_narration.ts:128-153`). This is acceptable because the sweeper cleans up.
- **IN-B04**: `request_skill_offer` still has no client caller (`index.ts:386-394`).
- **IN-B05**: the race name derived from player text reaches later prompts untagged, through `w()` rather than `wrapPlayerName` (`llm_layers.ts:454-506`).
- **IN-B06**: model text output is not scrubbed of echoed input tags or entities (`combat_narration.ts:179-217`, `llm_apply.ts:474-482`).
- **IN-B07**: `connActive` is still ignored by the client, and `submit_llm_result` remains a client-trusted apply path until Phase 42 (`index.ts:587+`).
- **IN-B08**: a billed result dropped because an offer is already pending only logs `console.error`. **Now also** `applyRenownPerkResult` for a settled rank (`llm_apply.ts:805-808`). Both are unreachable through the executor now, and reachable only through legacy `submit_llm_result`.
- **IN-B09**: the creation auto-start is gated on the global character list, not `myCharacters` (`src/App.vue:764`, `useCharacterCreation.ts:82`).
- **IN-B10**: the mana fallback in `archetypeForCharacter` misreads warriors who hold any mana ability (`llm_inputs.ts`, `character.ts:90-94`).

### Part B (new this iteration)

### IN-B11: A rank can be claimed twice: `chooseRenownPerkLogic` does not check `renownRankClaimed`, and the legacy `choose_perk` ignores ability claims and pending offers

*(pre-existing; `reducers/renown.ts` is outside the reviewed file list)*

**Files:** `spacetimedb/src/reducers/renown_perk.ts:36-40`; `spacetimedb/src/reducers/renown.ts:27-66`

**Issue:** `choose_perk` is still registered and exposed in the generated bindings, although the client does not call it.
- It picks "the lowest rank without a `renown_perk` row", so a rank claimed as a Renown ability looks unclaimed to it.
- It never deletes the pending rows for the rank it claims.

A hand-crafted call can therefore claim rank R from the static pool after R was taken as an active perk. It can also claim R while R's offer is pending, and the player can then choose from that offer too. `renownRankClaimed` sees both kinds of claim, but nothing enforces it at choice time.

**Fix:**
- Add `if (renownRankClaimed(ctx, characterId, Number(perk.rank))) return { success: false, error: 'You have already claimed this rank.' }` to `chooseRenownPerkLogic`.
- Delete `choose_perk`, or have it use `renownRankClaimed` and clear that rank's pending rows. Phase 42 is the natural place.

### IN-B12: The `damage_up` default gives defensive renown buffs the wrong effect

**File:** `spacetimedb/src/helpers/llm_apply.ts:789-793`

**Issue:** The renown prompt asks for things like "a defensive cooldown". A perk that returns `defense_up` or `evasion` is now kept, but as a damage buff. This matches skill_gen's default and is rare now that the prompt lists the vocabulary.

**Fix (optional):** Map common near-misses (`defense_up`, `armor_up`, `evasion`) to `ac_bonus` / `dodge`-style entries before falling back, or drop only the effect fields rather than retyping them.

### IN-B13: An old `AWAITING_RACE` state on another identity can still create a second character

*(pre-existing; residual of prior WR-B01)*

**File:** `spacetimedb/src/reducers/creation.ts:393-405, 470-486`; `finalizeCharacter` at `:135`

**Issue:** The fix intercepts `explore` at `AWAITING_RACE`. Any other line still goes to a billed `creation_race` call. `finalizeCharacter` does not check whether the user already has a character. So an `AWAITING_RACE` state left on device B, auto-started before the character existed on device A, can build a second character. This works whether or not the first character is stranded. The one-character rule is enforced only in `start_creation` (`:357-362`).

**Fix:** At the top of `submit_creation_input`, when the user already owns any character and `state.step` is not `COMPLETE`, delete the orphan state and post the stranded hint or the "you already have a character" line. Also add the same ownership check to `finalizeCharacter`.

---

_Reviewed: 2026-09-30T20:25:42Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
