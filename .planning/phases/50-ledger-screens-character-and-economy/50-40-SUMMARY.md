---
phase: 50-ledger-screens-character-and-economy
plan: 40
subsystem: economy
tags: [spacetimedb, salvage, economy, chance, crafting-loop, preview, publish, local, gap-closure]
requires:
  - phase: 50-30
    provides: salvage_item result row and the recipe-capped yield this plan replaces
  - phase: 50-34
    provides: Inventory salvage confirm that reads salvagePreview().confirmText
provides:
  - "Shared chance rule in crafting_rules.ts: salvageComponents, salvageSeed, salvageRoll, rollSalvage, salvageComponentChance, SALVAGE_COMPONENT_CHANCE_PCT"
  - "salvage_item rolls each component deterministically and grants only the hits"
  - "salvagePreview returns { components, knowable, reagentPossible, yields, confirmText } in chance wording"
affects: [50-38, crafting salvage detail, inventory confirm]
tech-stack:
  added: []
  patterns:
    - "One import-free rule file shared by the server reducer and the client preview through @game-data"
    - "Real-handler tests find a timestamp with tsWhere/rollSalvageAt using the same shared functions the handler calls"
key-files:
  created:
    - spacetimedb/src/data/salvage_loop.test.ts
  modified:
    - spacetimedb/src/data/crafting_rules.ts
    - spacetimedb/src/data/crafting_rules.test.ts
    - spacetimedb/src/reducers/items_crafting.ts
    - spacetimedb/src/reducers/salvage_result.test.ts
    - spacetimedb/src/reducers/recipe_discovery.test.ts
    - src/ledger/salvagePreview.ts
    - src/ledger/salvagePreview.test.ts
    - src/inventory/Inspector.component.test.ts
key-decisions:
  - "Chances 50/25/10 percent by material tier (tier 1/2/3+), amounts half rounded down (min 1) under the strict cap (req - 1) / outputCount; both numbers may be revised by the owner at UAT"
  - "The result card's existing 'Nothing usable was left.' is kept; it matches the feed line"
  - "The 12 percent bonus reagent and the INT scroll roll are unchanged; a reagent is never a recipe input"
  - "A salvage that returns nothing at all always writes the 'nothing usable was left' feed line, including slots with no salvage material (before, that case wrote no feed line)"
requirements-completed: [LDG-01, LDG-10, LDG-11]
duration: about 55 min
completed: 2026-10-07
status: complete
---

# Phase 50 Plan 40: Salvage as a chance at a smaller return Summary

**Salvage is now a deterministic chance (50/25/10 percent by material tier) at half the per-item inputs, strictly under what every recipe consumes, so a craft, salvage, craft loop can never repeat; one shared rule drives salvage_item and the Inventory confirm, published to the local database.**

## Performance

- **Tasks:** 3 of 3
- **Files:** 1 created, 8 modified (plus the SUMMARY)

## Accomplishments

- **Shared rule** (`spacetimedb/src/data/crafting_rules.ts`): `salvageComponents` takes the inputs of the lowest-id recipe that makes the item (else the slot material), halves them (rounded down, min 1), caps every amount at `(req - 1) / outputCount` over every recipe that makes the item, then trims from the last component so the sum stays under each recipe's total and the value under the item's vendor value. `salvageSeed`, `salvageRoll` (splitmix64 over BigInt, 0 to 99) and `rollSalvage` roll each component on its own. No `Math.random`; the seed is the server timestamp, instance id and character id.
- **salvage_item** reads every recipe that outputs the template, builds the parts from the part templates, rolls, and grants only the hits. Feed: `You salvaged X and received 1x A and 1x B.`, or `You salvaged X.` when only a bonus or scroll came back, or `You salvaged X, but nothing usable was left.` The reagent bonus and scroll rolls are unchanged and now follow the main line.
- **Preview** (`src/ledger/salvagePreview.ts`): `confirmText` speaks in chances and has no digit; component yield lines read `×1 · 50% chance` with note `unlikely` under 25 percent. Parity with the server is by calling the same `salvageComponents`.
- The old guaranteed yield (`salvageMaterialYield`, `SalvageYieldInput`) is deleted; nothing under `spacetimedb/src` or `src` references it.

## Task Commits

1. **Task 1: shared rule, loop/distribution tests, preview and confirm** - `064aa196`
2. **Task 2: salvage_item on the rule, real-handler tests, old yield removed** - `56227a24`
3. **Task 3: local publish** - no files changed (see Publish)

## Evidence

**RED then GREEN**
- Task 1: with the HEAD `crafting_rules.ts` restored temporarily, `crafting_rules.test.ts` plus `salvage_loop.test.ts` ran 10 failed, 50 passed, 2 files failed (`salvageSeed is not a function` and the missing imports). With the new rule: 73 passed (2 files). The client preview and Inspector tests were written for the new shape and went green together with the implementation; a separate client RED run was not captured.
- Task 2: against the Task 1 tree (old handler), `salvage_result.test.ts` plus `recipe_discovery.test.ts` ran 22 failed, 39 passed. After the handler change: 61 passed (2 files).

**Gate counts**
- `spacetimedb` suite: 118 files, 4749 tests passed (excluding the known `measurement.results.test.ts`).
- Root `npx vitest run`: 277 files passed, 3 failed, 8844 tests passed, 2 failed. The failures are exactly the three known baseline files: `scripts/llm/call_log_report.test.mjs`, `scripts/llm/proof_rules.test.mjs`, `spacetimedb/src/helpers/measurement.results.test.ts`.
- `src/ledger` plus `src/inventory`: all green (18 files); `npx vue-tsc -b` exits 0 with no output.
- Acceptance greps: `salvageComponents(`, `salvageRoll`, `salvageSeed`, `rollSalvage` each exported once; `Math.random` count 0 in `crafting_rules.ts` and `items_crafting.ts`; `salvageComponents(` count 1 in `salvagePreview.ts`; `You'll get` count 0; `salvageMaterialYield` has no references. No `replaceAll`, `.at(`, `Object.hasOwn` or the banned word in the touched source files.

**Measured rates over 20000 seeds** (`salvageSeed(T0 + k, 500n, 1n)`, components of tier 1, 2 and 3 together)

| Component | Target | Measured |
|-----------|--------|----------|
| tier 1 (50%) | 50 | 49.86% |
| tier 2 (25%) | 25 | 24.77% |
| tier 3 (10%) | 10 | 9.90% |
| nothing returned | 33.75 | 34.17% |
| all three together | n/a | 1.26% |

**Amount table for generated recipes** (per craft; chance by material tier)

| Item | Before (guaranteed) | After (chance) |
|------|---------------------|----------------|
| weapon or armor, primary (req 3) | slot material at the tier count (2, 2 or 3), capped at the recipe's count of that material | 1 of the primary, at 50/25/10% |
| accessory, primary (req 2) | up to 2 of the slot material (the Void Crystal Pendant returned both) | 1 of the primary, at its tier's chance |
| every secondary (req 1) | never separately (slot material only) | never (a req 1 input has a strict cap of 0) |
| non-craftable (drops, starter gear) | 2 / 2 / 3 of the slot material by tier | 1 of the slot material at 50/25/10% by tier |

**Real-handler loop count:** with 9 Darksteel Ore and 10 Rough Hide, craft a Darksteel Sword then salvage it with every roll hitting: 4 loops, the material units fall each loop (sword takes 3 Darksteel and 1 hide, full luck returns 1 Darksteel), and craft_recipe then refuses (no new sword); 1 Darksteel Ore is left.

## Publish

Command, exactly: `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null`

- Before: `SELECT key_set, key_length FROM admin_llm_status` gave `true | 108` (saved to the git dir as `uwr-50-40-key-before.txt`, matched by `grep -qE "true +[|] +108"`).
- Ping 200 before and after; `git status --porcelain spacetimedb/src` empty before publishing.
- Output tail: `Checking for breaking changes...`, an empty `Database Migration Plan`, `Publishing module...`, `Updated database with name: uwr, identity: c200f2029b92b15e2164adf6951b34cc614ea4063d36996c58cac1799244c14a`. Exit 0. (The CLI also printed a `tsc not found in node_modules` line before `Build finished successfully.`, unchanged by this plan.)
- After: `true | 108` again; the last 80 log lines have no panic; `git status --porcelain src/module_bindings` is empty (bindings unchanged, none regenerated).
- No clear, no maincloud, no push; the owner's SpacetimeDB (127.0.0.1:3000) and the Vite server were never started, stopped or restarted.

## Deviations from Plan

**1. [Rule 1 - Bug in the plan's test design] tsWhere's default scroll constraint was unsatisfiable**
- **Found during:** Task 2 (reagent tests)
- **Issue:** Requiring both a reagent hit and a scroll miss by default is impossible for instance 500 and character 1: the reagent roll is `ts % 100` and the scroll roll is `(ts + 1) % 100`, so a reagent hit forces a scroll roll under the chance.
- **Fix:** The scroll roll is only constrained when a test names it (default `'any'`; no scroll template exists unless a test adds one). The reagent roll still defaults to a miss.
- **Files modified:** `spacetimedb/src/reducers/salvage_result.test.ts`
- **Commit:** 56227a24

**2. [Plan wording] A slot with no salvage material now writes the 'nothing usable was left' feed line**
- Before, a salvage that returned nothing because the slot has no material wrote no feed line at all. The plan's feed rules say "nothing at all" gets the existing sentence, so `salvage_item` writes it for every empty salvage and the old 'a slot with no salvage material' test now expects that line. The result card is unchanged (no lines show 'Nothing usable was left.').

**3. [Test expectation] full-luck total cap across recipes**
- In the multi-recipe case where another recipe consumes only 2 units in all, the sum cap trims the last component (Iron Ore) as the plan's "for every such recipe" rule says. The unit test pins it.

Otherwise the plan executed as written.

## Authentication gates

None.

## Known Stubs

None.

## Threat Flags

None. The only new surface is the deterministic roll inside the existing `salvage_item` reducer; the seed uses the server timestamp and ids, and the full-luck caps mean even a perfectly predicted roll cannot create a loop (T-50-162).

## Decisions Made

- Chances of 50/25/10 by material tier and amounts at half rounded down under the strict cap. Both may be revised by the owner at UAT.
- The result card's existing `Nothing usable was left.` is kept, matching the feed line.
- The bonus reagent (12 percent) and the scroll roll are unchanged; the reagent invariant (a reagent is never a recipe input) is pinned by tests.
- The hub keeps one recipe per output (the lowest id), so the client preview sees the same recipe the server takes the components from. If a second recipe ever outputs the same template, the server also caps by it and the preview would not; today every generated recipe has its own output template.

## Hand-off for plan 50-38 (Crafting Salvage tab)

Plan 50-38 reads `yields` and `confirmText` from `salvagePreview` (`src/ledger/salvagePreview.ts`). Its "You'll receive" heading and any "guaranteed ×n" wording must follow this plan's chance wording: say what it may return, never a count, and show each yield line's `text` (`×1 · 50% chance`, `12% chance`) and `note` (`unlikely`, `from “of Intelligence”`). Final interface:

```ts
export interface SalvagePreviewInput {
  instance: Pick<ItemInstance, 'id'>;
  template: ItemTemplate;
  affixes: readonly ItemAffix[];
  characterId: bigint;
  /** null = no recipe makes it; undefined = the hub has not applied */
  outputRecipe: RecipeTemplate | null | undefined;
  templates: ReadonlyMap<bigint, ItemTemplate>;
}

export interface SalvageYieldView {
  key: string;            // 'component:{item key of the name}' or 'reagent'
  icon: typeof PhCube;
  iconColor: string;
  name: string;
  note: string;           // 'unlikely' (component under 25%), 'from “{affix}”' on the reagent, else ''
  text: string;           // '×1 · 50% chance' on a component, '12% chance' on the reagent
  chance: boolean;        // true on every line
}

export interface SalvagePreview {
  components: SalvageComponent[];   // { templateId: bigint | null; name; amount: bigint; chancePct: bigint }; empty while !knowable
  knowable: boolean;                // false while the hub has not applied or a recipe part template is not loaded
  reagentPossible: boolean;
  yields: SalvageYieldView[];       // components first (in roll order), then the reagent line
  confirmText: string;              // 'Salvage destroys this item. ...' no digits
}

export function salvagePreview(input: SalvagePreviewInput): SalvagePreview | null; // null unless salvageable
```

`confirmText` patterns: `It may return some A and B.` (25 percent or more), `C rarely comes back.` / `C and D rarely come back.` after likely ones, else `It may rarely return C.`; `It may also give a reagent.` (or `It may give a reagent.` with no component); `Nothing usable will come of it.` when neither; while not knowable: `It may return some materials.` plus the reagent sentence.

## Deferred UAT (milestone end)

Salvage a crafted weapon several times. Sometimes nothing comes back, and a tier 3 material rarely does. Read the confirm wording in the Inventory.

## Self-Check: PASSED

- Files found: `spacetimedb/src/data/salvage_loop.test.ts`, `spacetimedb/src/data/crafting_rules.ts`, `spacetimedb/src/reducers/items_crafting.ts`, `src/ledger/salvagePreview.ts`.
- Commits found: 064aa196, 56227a24.
