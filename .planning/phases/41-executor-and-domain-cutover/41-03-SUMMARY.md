---
phase: 41-executor-and-domain-cutover
plan: 03
subsystem: llm-apply-hardening
tags: [spacetimedb, llm, apply, validation, renown, creation, tests]
status: complete
requires:
  - phase: 41-01 (llm_limits constants, Phase 41 schema, test seams)
  - phase: 40-08 (llm_apply.ts extracted from submit_llm_result)
provides:
  - "helpers/safe_numbers.ts: toBigIntSafe, clampInt"
  - "helpers/creation_validate.ts: validateRaceReply, validateClassReply, CreationRaceReply, CreationClassReply, CreationAbility"
  - "helpers/renown.ts: exported serializePerkEffect and idempotent insertStaticRenownPerkOptions (returns rows inserted)"
  - "llm_apply.ts: clamped creation apply, shared renown fallback, renown_perk_gen branch in applyLlmFailure, toBigIntSafe at every model-supplied numeric site"
affects: [41-05, 41-06, 41-07, 41-14]
tech-stack:
  added: []
  patterns:
    - "Clamp and default, never reject: creation replies are repaired to the vocabulary instead of bouncing the player"
    - "Model numbers become bigint columns only through toBigIntSafe (a throw rolls back the whole apply)"
    - "An earned renown offer is never lost: apply fallback and terminal failure share one idempotent inserter"
key-files:
  created:
    - spacetimedb/src/helpers/safe_numbers.ts
    - spacetimedb/src/helpers/safe_numbers.test.ts
    - spacetimedb/src/helpers/creation_validate.ts
    - spacetimedb/src/helpers/creation_validate.test.ts
  modified:
    - spacetimedb/src/helpers/renown.ts
    - spacetimedb/src/helpers/llm_apply.ts
    - spacetimedb/src/helpers/llm_apply.test.ts
    - spacetimedb/src/helpers/submit_llm_result.characterization.test.ts
    - spacetimedb/src/helpers/__snapshots__/submit_llm_result.characterization.test.ts.snap
key-decisions:
  - "insertStaticRenownPerkOptions returns the number of rows inserted; callers post the Keeper line only when it is greater than 0, so an already-offered rank or a rank without a pool stays silent (matches the old rank-99 pin)"
  - "A creation race reply that named no race is validated to the placeholder 'Unknown' but still saves NO race_definition (checked against the raw reply), so 'Unknown' is never offered for reuse"
  - "Legacy ability field names (baseDamage, manaCost, effect) are not aliased: Claude structured output guarantees the canonical shape, so the validator reads only the vocabulary fields"
  - "A zero rewardXp on an NPC quest keeps the level-based default (old falsy semantics preserved) while NaN, fractional and huge values are floored or clamped"
metrics:
  tasks: 2
  files: 9
  tests_added: 77 (Task 1) + 20 (llm_apply) + 6 (characterization)
  suite: "1617 passed (baseline 1520)"
completed: 2026-09-30
---

# Phase 41 Plan 03: Apply-Layer Hardening Summary

Real model output can no longer crash or corrupt an apply: creation replies are clamped to the mechanical vocabulary, every model-supplied number goes through a never-throwing converter, the renown static fallback works for every rank, and a terminal renown failure still gives the player their options.

## What was built

### Task 1: pure clamps (commit b4956d56)
- `safe_numbers.ts`: `toBigIntSafe(value, {min, max, fallback})` floors and clamps finite numbers and numeric strings, clamps bigints, and returns the (unclamped) fallback for NaN, Infinity, null, undefined, objects, blank and non-numeric strings. `clampInt` is the number-space twin.
- `creation_validate.ts`: `validateRaceReply` (stats to STAT_TYPES with 'str'/'dex' defaults and a collision move for the secondary, primary 1-3 default 2, secondary 1-2 default 1, name trimmed and cut to 40 code points, flavor capped at 200) and `validateClassReply` (stats, bonusHp 0-20, bonusMana 0-30, proficiencies filtered to WEAPON_TYPES and ARMOR_TYPES and de-duplicated, at most 3 abilities with kind, damageType, resourceType, targetRule from the vocabulary, cooldown 4-12, per-resource cost range, mana cast time at least 1, value1 and effectMagnitude through `clampToBudget` at level 1). The result holds only numbers, strings and booleans, so `JSON.stringify` is always safe.
- 77 tests (boundaries, hostile input, surrogate-pair cut, no bigint in output).

### Task 2: wiring and deliberate test flips (commit 660b5538)
- `renown.ts`: `serializePerkEffect` exported unchanged; `insertStaticRenownPerkOptions` exported, returns the inserted count, and is idempotent per character and rank (fixes IN-08).
- `llm_apply.ts`:
  - `applyCreationResult` builds the state update, the displayed text and the `race_definition` insert only from the validated object.
  - `applyRenownPerkResult` uses the shared fallback (no more inline `JSON.stringify(perk.effect)`), keeps the Keeper line and the legacy counter call, and converts every LLM perk number with `toBigIntSafe(..., {0n, 1_000_000n, 0n})`. Small extra hardening in the same block: non-string `perkEffectJson`, `damageType`, `effectType` become undefined instead of a type error on insert, and `kind` is coerced before `.trim()`.
  - `applyNpcConversationResult`: `requiredCount`, `rewardXp`, `rewardGold` via `toBigIntSafe`; the affinity amount is truncated (`Math.trunc`) so `BigInt(2.5)` cannot throw (IN-01).
  - `applyLlmFailure`: new `renown_perk_gen` branch (guarded parse, character must exist, inserts static options, one private narrative Keeper line only when rows were inserted).
- The legacy budget-counter calls and `retryWorldGen` are untouched (per the plan's hard rules).

## Deliberate characterization changes

The characterization file was run WITHOUT `-u` first. Exactly nine cases failed, the expected set: the three the plan named plus the renown failure case, the class/race cases whose stored JSON is now the validated shape, and the null-ability case. Then `-u` was run once; the diff was compared by entry name against the pre-change snapshot (116 entries before, 117 after). Snapshots for the renown ranks without bigint effects (4, 6) and for every other entry are byte-identical.

Changed or replaced snapshot entries (old name -> new name, and why):

| Old entry | New entry | Why |
|---|---|---|
| `creation replies: Phase 41 validator gap > ...race reply with out-of-range bonuses is stored and shown unclamped` | `creation replies: Phase 41 clamped > Phase 41: clamped - a race reply ... stored and shown clamped` | Named by the plan. 99 -> 3, secondary stat 'nonsense' -> 'dex' (the secondary default; the primary was already 'str'), -5 -> 1; race_definition and the message follow (`+3 STR, +1 DEX`) |
| `creation replies: Phase 41 validator gap > ...class reply with over-budget ability values is stored unclamped` | `creation replies: Phase 41 clamped > Phase 41: clamped - a class reply ... stored clamped` | Named by the plan. kind 'nonsense' -> 'damage', value1 99999 -> the level-1 damage budget maximum, resourceCost 9999 (added to the reply) -> 15, bonusHp 9999 -> 20, 'mail' dropped |
| `renown_perk_gen success > QUIRK: the rank-2 static fallback throws ...` (a throw pin, no snapshot) | `renown_perk_gen success > Phase 41: the rank-2 static fallback inserts serialized options ...` | Named by the plan. Now snapshots three Iron Will / Keen Eye / Smooth Talker rows with `perkEffectJson` `{"maxHp":25,"str":1}` and the Keeper line. Also added non-snapshot cases for ranks 3, 5, 9, 11 |
| `failure path > renown_perk_gen failure changes nothing but the task status` | `failure path > Phase 41: renown_perk_gen failure inserts the static options for the rank and one Keeper line` | Required by T-41-20 (not named as a snapshot in the plan): a terminal failure now inserts the three rank-2 options and one Keeper line |
| `creation_class success > applies a valid reply: CLASS_REVEALED, ...` (same name, CONTENT changed) | same | Stored `classStats` is now the validated shape and key order (`usesMana`, `weaponProficiencies`, `armorProficiencies`; the unread `armorProficiency` is gone), abilities gain `targetRule`, `armorProficiencies` 'mail' is dropped, so the message reads `Armor: leather` |
| `creation_class success > accepts legacy ability field names and a mana-user class line` | `creation_class success > Phase 41: legacy ability field names are not read ...` | Legacy names (baseDamage, manaCost, effect) are no longer read: defaults apply (kind damage, value1 15, cost 15 mana, cast 1). The case now seeds archetype 'mystic' to pin the mana default |
| `creation_class success > QUIRK: an empty object stores "Unknown Class" and prints "**undefined**"` | `creation_class success > Phase 41: an empty object stores "Unknown Class" with default stats and prints "**Unknown Class**"` | `classStats` is now the default stats object (was `{}`); the class name prints instead of `undefined` |
| `creation_class success > QUIRK: an error midway ... (null ability) reverts the state update` | `creation_class success > Phase 41: a null ability entry is dropped, not fatal ...` | Non-object ability entries are dropped by the validator, so the reply is applied (CLASS_REVEALED, className 'Half Built', abilities `[]`) instead of throwing and reverting |
| `creation_race success > QUIRK: a reply without raceName stores "Unknown", prints "**undefined**" ...` | `creation_race success > Phase 41: a reply without raceName stores "Unknown" with default bonuses, prints "**Unknown**" ...` | `raceBonuses` is the default bonus object (was `{}`), the message prints `**Unknown**` and `+2 STR, +1 DEX`; still no race_definition saved |

Note: the last five rows changed because the validator normalizes the stored JSON; the plan allowed "renown/creation entries whose only change is the normalised or clamped JSON". The null-ability and legacy-name rows are the two behavior consequences beyond pure normalisation (a throw-and-revert became a success; legacy aliases stopped being read); both follow directly from the plan's "clamp, never reject" and "non-object entries dropped" rules.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fractional affinity amount could still throw**
- **Found during:** Task 2 (IN-01 sweep of `BigInt(...)` in `applyNpcConversationResult`)
- **Issue:** `let amount = Number(effect.amount) || 0` allowed 2.5, then `BigInt(amount)` threw and rolled the whole apply back.
- **Fix:** `Math.trunc(Number(effect.amount)) || 0`. In-range integers behave as before.
- **Files modified:** spacetimedb/src/helpers/llm_apply.ts (test in llm_apply.test.ts)
- **Commit:** 660b5538

**2. [Rule 2 - Missing critical functionality] Non-string optional perk fields and non-string `kind`**
- **Found during:** Task 2, renown LLM-perk insert
- **Issue:** `perk.perkEffectJson || undefined`, `damageType`, `effectType` could carry an object or number into a string column, and `perk.kind.trim()` could throw for a non-string kind.
- **Fix:** keep those fields only when non-empty strings; coerce `kind` with `String()` before `.trim()`. Valid replies are unchanged (all existing snapshots hold).
- **Commit:** 660b5538

**3. [Process] Class-name/race-definition guard**
- The plan says build the race_definition insert "only from the validated object". Because the validator turns a missing name into 'Unknown', the save guard checks the raw reply for a non-empty string name so the old "no definition for a nameless race" behavior is kept. This is a tiny read of the raw reply, not a stored value.

Also: both tasks' commits are `feat` commits containing tests and code together (plan type is `execute`; Task 1 tests and code were written together, Task 2 flipped the pinned tests in the same commit as the behavior change so no commit leaves the suite red).

## Known Stubs
None.

## Threat Flags
None beyond the plan's threat model. T-41-12 (creation clamps), T-41-12b (toBigIntSafe and serializePerkEffect at every model-supplied numeric site) and T-41-20 (renown failure delivers options, idempotent, tested) are mitigated and covered by tests. T-41-11 (prompt injection) is transferred as planned; breadcrumb to /gsd-secure-phase.

## Notes for later plans
- Plan 41-05 changes the enqueue call in `triggerRenownPerkGeneration`; it should keep calling `insertStaticRenownPerkOptions` for the no-player path (now returns a count, ignored there).
- Plan 41-07 (sweeper) and the executor can call `applyLlmFailure` for an expired or terminally failed `renown_perk_gen` job and rely on the static options and the Keeper line being delivered once.
- Plan 41-14 still owns `retryWorldGen`.
- `spacetime build -p spacetimedb` finished successfully after the changes. No publish was run; nothing touched maincloud; `.env.local` was never read. The orchestrator's trailer instruction was followed using this harness's own attribution lines.

## Self-Check: PASSED
- FOUND: spacetimedb/src/helpers/safe_numbers.ts, safe_numbers.test.ts, creation_validate.ts, creation_validate.test.ts
- FOUND commits: b4956d56, 660b5538
- Acceptance greps: `JSON.stringify(perk.effect)` 0, `validator gap` 0 in the characterization test, `insertStaticRenownPerkOptions(` 2 in llm_apply.ts, `export function serializePerkEffect` 1, forbidden imports 0
- Full suite: `CI=true pnpm --dir spacetimedb exec vitest run --maxWorkers=1` 1617 passed (baseline 1520); characterization file clean in CI mode
