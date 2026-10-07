---
phase: 50-ledger-screens-character-and-economy
plan: 28
subsystem: crafting-shared-rules
tags: [spacetimedb, crafting, salvage, pure-rules, game-data, tdd, gap-closure]

requires:
  - phase: 50-27
    provides: "Vendor quantity client; the @game-data alias pattern and alias pins"
provides:
  - "planCraft count (batch, all or nothing), MAX_CRAFT_COUNT 99n, maxCraftCount"
  - "primaryMaterialTier, salvageMaterialYield, salvageReagentDefs, SALVAGE_REAGENT_CHANCE_PCT 12n"
  - "generatedDescription (rule-based output descriptions) and FOOD_BUFF_LABELS in recipe_rules.ts"
  - "data/action_result.ts: RESULT_KINDS, RESULT_LINE_KINDS, ResultLine, MAX_RESULT_LINES, encodeResultLines, decodeResultLines"
affects: [50-29, 50-30, 50-31]

key-files:
  created:
    - spacetimedb/src/data/action_result.ts
    - spacetimedb/src/data/action_result.test.ts
  modified:
    - spacetimedb/src/data/crafting_rules.ts
    - spacetimedb/src/data/crafting_rules.test.ts
    - spacetimedb/src/data/recipe_rules.ts
    - spacetimedb/src/data/recipe_rules.test.ts
    - spacetimedb/src/reducers/hunger.ts
    - spacetimedb/src/reducers/recipe_discovery.test.ts
    - src/gameDataAlias.test.ts

key-decisions:
  - "planCraft's ok result carries count only for a batch above 1n, so every pre-existing planCraft toEqual test stays unchanged"
  - "Armor descriptions say 'cut from' for a leather (hide) primary and 'woven from' for a cloth primary, derived from the armor type, so the input needs no primary kind"
  - "A trinket accessory whose stat is not in the stat word table falls back to the slot sentence"

requirements-completed: [LDG-10, LDG-11, LDG-01]

status: complete
completed: 2026-10-06
---

# Phase 50 Plan 28: Shared crafting and salvage rules, output descriptions, result line codec Summary

The pure, import-free rules the crafting and inventory follow-up needs: one planning rule for a craft or a batch of n with its maximum, the salvage yield and reagent chance as shared data, rule-based descriptions for generated outputs, and the result card line codec. No reducer behavior changed and nothing was published.

## Commits

| Commit | Message |
|--------|---------|
| 7376cd15 | feat(50-28): planCraft count, maxCraftCount and shared salvage yield rules (Task 1) |
| 8a494ff3 | feat(50-28): rule-based descriptions for generated outputs and shared food labels (Task 2) |
| 4f858bd7 | feat(50-28): result line codec for the action result card (Task 3) |

## What changed

- **crafting_rules.ts.** `CraftPlanInput.count` (1n when omitted, below 1n counts as 1n). Every `need()` is multiplied by the batch size before any check and the catalyst and reagent checks compare against n, so the rule stays linear and the messages and order are unchanged. `MAX_CRAFT_COUNT = 99n` and `maxCraftCount` (0n when a single craft is refused, else the smallest of 99 and have / per-craft need over the single-craft consumes). `primaryMaterialTier` (craftQualityForMaterialName now uses it). New salvage section: `SALVAGE_REAGENT_CHANCE_PCT = 12n`, `salvageMaterialYield` (the reducer's arithmetic step for step: tier table count, value cap, recipe cap) and `salvageReagentDefs` (non-implicit affix stat keys, in CRAFTING_MODIFIER_DEFS order). Still import-free.
- **recipe_rules.ts.** `FOOD_BUFF_LABELS` (same keys and words as hunger.ts had), `GeneratedDescriptionInput`, `generatedDescription`, and `generatedOutput` writes it (Chosen gained `formWord`; the accessory stat and the food magnitude are passed in). The old two-material sentence is gone. Still import-free.
- **hunger.ts.** The local `BUFF_TYPE_LABELS` map is replaced by an import of `FOOD_BUFF_LABELS`; nothing else changed and the eat line is the same (the eat_food test now asserts the exact line).
- **action_result.ts (new, import-free).** Constants, `isResultKind`, `encodeResultLines` (decimal strings, instanceId null becomes '', first 12 lines) and `decodeResultLines` (never throws; drops unknown kind, non-string name, bad numbers; own-property reads only; at most 12 entries).
- **Tests.** recipe_discovery.test.ts finds generated templates by the recipe outputs instead of the old sentence. gameDataAlias.test.ts gained `@game-data action_result` (same module as the relative path, imports nothing) and action_result.ts joined the sibling import-free list.

## Description sentences (one fixture per category)

- Weapon (Iron Shard + Scrap Cloth, level 1): `A dagger forged from Iron Shard, wrapped in Scrap Cloth. It deals 4 base damage at 5 DPS.`
- Armor: `A leather jerkin cut from Rough Hide, lined with Scrap Cloth. It adds 3 armor.` (plural form: `A pair of leather pants cut from Rough Hide, lined with Scrap Cloth. It adds 2 armor.`)
- Accessory: `A pendant set with Bone Shard, on a Scrap Cloth cord. It adds 3 health.` (no stat: `... It is worn at the neck.`)
- Consumable: `A broth cooked from Wild Berries and Clear Water. Eating it makes you well fed: +1 mana regeneration.`

## TDD evidence and gate counts

- **Task 1.** The new describes were written first and the implementation followed in the same working session; a separate RED run against the old module was not captured (the new exports did not exist, so the new tests could only fail on import). First GREEN run surfaced three pre-existing `toEqual` plan assertions failing on an added `count: 1n`; resolved by carrying `count` only for a batch (see Deviations). GREEN: crafting_rules, craft_quality, recipe_discovery 3 files, 104 tests pass; client `gameDataAlias` + `src/crafting` 5 files, 135 tests pass; vue-tsc clean. The grid property test checks 7 recipe shapes x 3 reagent setups x 512 bag combinations (10,752 points), asserting planCraft at max is ok and at max + 1 is refused below the cap.
- **Task 2.** RED: 9 of 65 recipe_rules tests failed (generatedDescription and FOOD_BUFF_LABELS missing, the column test pinned to the new weapon sentence). GREEN: recipe_rules, recipe_discovery, no_ripple_word 3 files, 100 tests pass; generatedRecipes and gameDataAlias 30 tests pass. `grep -c "Crafted from"` on recipe_rules.ts and `grep -c BUFF_TYPE_LABELS` on hunger.ts are both 0.
- **Task 3.** RED: action_result.test.ts failed to load (module missing). GREEN: action_result and no_ripple_word 17 tests pass. Full module suite (`--exclude **/measurement.results.test.ts`): 114 files, 4646 tests pass. `gameDataAlias` 25 tests pass, vue-tsc exit 0. `grep -cE "^import|from '"` on action_result.ts is 0.
- The module run left `spacetimedb/src/helpers/__snapshots__/claude_request.test.ts.snap` modified with an empty `git diff --ignore-cr-at-eol`; restored with `git restore`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Conflict in plan] planCraft ok result carries `count` only for a batch**
- **Found during:** Task 1 first GREEN run
- **Issue:** The behavior block says the ok result carries `count` while also requiring every existing planCraft test to pass unchanged; three existing `toEqual` assertions on the full ok object failed once `count: 1n` was always added.
- **Fix:** `count?: bigint` on the ok branch, set only when the batch is above 1n. A single craft's plan is byte-identical to before; a batch carries `count`. No downstream plan text reads `plan.count`.
- **Files modified:** spacetimedb/src/data/crafting_rules.ts, spacetimedb/src/data/crafting_rules.test.ts
- **Commit:** 7376cd15

**2. [Process] Task 1 RED run not captured.** See the TDD evidence note above.

## Known Stubs

None.

## Threat Flags

None. All three threat-register mitigations (T-50-116 batch multiplies every need before any check with a grid property test at max and max + 1, T-50-117 salvage arithmetic copied step for step, T-50-118 decode never throws with strict checks) are implemented and tested. The salvage_item reducer is untouched until plan 50-30.

## Self-Check: PASSED

- Files exist: crafting_rules.ts and .test.ts, recipe_rules.ts and .test.ts, action_result.ts and .test.ts, hunger.ts, recipe_discovery.test.ts, gameDataAlias.test.ts.
- Commits 7376cd15, 8a494ff3 and 4f858bd7 exist on master.
