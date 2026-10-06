---
phase: 50-ledger-screens-character-and-economy
plan: 25
subsystem: crafting-recipe-generation
tags: [spacetimedb, crafting, recipes, generation, publish, local, gap-closure]

requires:
  - phase: 50-02
    provides: "craft_recipe, research_recipes, planCraft and the crafting model"
  - phase: 50-24
    provides: "vendor base stock (generated templates become world item templates a vendor may stock)"
provides:
  - "data/recipe_rules.ts: import-free, pure recipe generation rules (material kinds, category rules, forms, area level, candidates, generated output)"
  - "research_recipes generates, stores once per key, shares and discovers recipes (at most 3 new per call)"
  - "salvage_item no longer prints a debug line for a recipe with no scroll item"
affects: [50-26, 50-27, phase 51 (crafting content now exists to show)]

tech-stack:
  added: []
  patterns:
    - "Pure rules module shared with the client through @game-data and pinned import-free by a source-reading test"
    - "Shared world rows keyed by a stable string key (gen:{category}:{primary}+{secondary}:L{level}); lookup by iterating a snapshot Map"

key-files:
  created:
    - spacetimedb/src/data/recipe_rules.ts
    - spacetimedb/src/data/recipe_rules.test.ts
    - spacetimedb/src/reducers/recipe_discovery.test.ts
    - src/crafting/generatedRecipes.test.ts
  modified:
    - spacetimedb/src/reducers/items_crafting.ts
    - .planning/phases/50-ledger-screens-character-and-economy/50-VALIDATION.md
    - .planning/phases/50-ledger-screens-character-and-economy/50-25-PLAN.md

key-decisions:
  - "A candidate part carries the count the recipe consumes (3/1, 3/1, 2/1, 2/1), never the count held; the bag only decides eligibility"
  - "vendorValue of an output is the summed required-input value, so crafting then selling never beats selling the inputs"
  - "No schema, binding, prompt, Keeper Bible or route text change"

requirements-completed: [LDG-10, LDG-11]

status: complete
duration: ~55min
completed: 2026-10-06
---

# Phase 50 Plan 25: Rule-based recipe generation from carried materials Summary

Discover recipes at a crafting station now builds recipes by rule from the materials the character carries (metal makes weapons, hide and cloth make armor, stone, bone and spirit and void materials make accessories, edibles make food), at the station's area level, stored once per key and shared by every later discoverer, with no LLM and no schema change; published to the owner's local database with the key intact and the bindings unchanged.

## Commits

| Commit | Message |
|--------|---------|
| 48c44cb2 | feat(50-25): pure recipe generation rules with tests and a client model test (Task 1) |
| 5b616a90 | feat(50-25): research_recipes generates, deduplicates and discovers recipes by rule (Task 2) |

Task 3 is a database publish with no file change (nothing to commit).

## The rules (recipe_rules.ts)

Material to kind (own-property lookup; essences and the nine reagents are deliberately absent):

| Kind | Keys | Source |
|------|------|--------|
| metal | copper_ore, iron_ore, darksteel_ore, iron_shard | getMaterialForSalvage and MATERIAL_DEFS descriptions (ores); starter material descriptions (iron_shard) |
| hide | rough_hide, tanned_leather, shadowhide | getMaterialForSalvage (light armor to hides) |
| cloth | scrap_cloth, flax, moonweave_cloth | starter descriptions (scrap_cloth, flax); MATERIAL_DEFS (moonweave_cloth) |
| trinket | bone_shard, spirit_essence, void_crystal, stone | getMaterialForSalvage jewelry trio; Traveler Necklace "a polished stone" (stone) |
| wood | wood | deleted seed recipes (haft, torch shaft) |
| edible | herbs, bitter_herbs, wild_berries, mushrooms, root_vegetable | deleted seed food recipes |
| base | clear_water, murky_water, salt | deleted seed food recipes (food bases) |
| unmapped | resin, sand, dry_grass, peat, lamp_oil, ancient_dust | old utility outputs with no data-driven effect today |

Category rules: primary kinds weapon [metal], armor [hide, cloth], accessory [trinket], consumable [edible]; secondary kinds in preference order weapon [hide, cloth, wood], armor [hide, cloth, metal], accessory [cloth, hide, metal], consumable [base, edible]; counts primary/secondary 3/1, 3/1, 2/1, 2/1; at most 3 new recipes per Discover. Each primary (sorted by tier descending, then name, then template id) takes its single best secondary; the four category lists are interleaved by rank so a capped Discover spreads over categories.

Naming: the primary's display name without a trailing " Ore", plus a form word (weapon forms follow WEAPON_TYPES, start form dagger for a cloth secondary, sword for hide, staff for wood; armor Robe/Jerkin, Trousers/Pants, Boots; accessory Pendant, Ring, ring first for a metal setting; food Draught, Broth, Stew, Roast, Salad, with the edible word Herbal, Bitter, Berry, Root, Mushroom, starting at the primary's buff, or dex when the secondary is a second edible). A taken name (case-insensitive, over every item_template and recipe_template name) walks to the next form cyclically; with every form taken the start form takes a numeral (" 2", " 3").

Key format: `gen:{category}:{primaryKey}+{secondaryKey}:L{level}`, for example `gen:weapon:iron_shard+scrap_cloth:L1`.

Level: `max(1, floor(dangerMultiplier / 100) + levelOffset)`; requiredLevel equals it. Level 1 equals the starter gear (parity test). Growth: weapons +floor(6(L-1)/5) to damage and dps, armor +floor(4(L-1)/5) to AC, accessory stat and food magnitude times levelStep (1 at levels 1-4, 2 at 5-9, 3 at 10), the quest reward budget slope.

## TDD evidence

- Task 1 RED (stub exporting the names with wrong behavior): `recipe_rules.test.ts` 38 failed, 18 passed (56); `generatedRecipes.test.ts` 6 failed, 1 passed (7). GREEN after implementation: 56 and 7 pass. One fix on the way: candidate parts first carried the held count; the behavior spec says the consumed count, changed and the test tightened.
- Task 2 RED (against the old reducer): `recipe_discovery.test.ts` 12 of 24 failed: first Discover, second Discover and the third finding nothing, the live-bag cap, short count, Herbal Draught shared across characters, the level band, dagger craft, tier 2 craft, essence craft, refused craft, food craft and eat, and the salvage test. After the `research_recipes` rewrite alone, 23 passed and the salvage test still failed with the exact `[Debug] No scroll template found for: Iron Shard Dagger.` line; removing that branch made all 24 pass.

## Gate results

- `cd spacetimedb && pnpm exec vitest run src/data` (banned-word guard included): 25 files, 820 tests passed (Task 1).
- Task 2 targeted: recipe_discovery, craft_quality, recipe_rules: 3 files, 102 tests passed.
- Full spacetimedb suite, `measurement.results.test.ts` excluded: 111 files, 4501 tests, all passed.
- `pnpm exec vitest run --dir src --maxWorkers=2`: 142 files, 3100 tests, all passed.
- `pnpm exec vue-tsc -b`: exit 0 (after Task 1 and after Task 2).
- Grep gates: `export function recipeCandidates|generatedOutput|areaLevel|recipeKey` 1 each; no `Math.random|Date.now|new Date` in recipe_rules.ts; "no import specifier" test present; `@game-data/recipe_rules` in the client test; `recipeCandidates(` 1, `generatedOutput(` 1, `MAX_NEW_RECIPES_PER_DISCOVER` 2, "You discover nothing new." 1 and the station line 2 in items_crafting.ts; "No scroll template found" 0; `git status --porcelain src/crafting src/ledger src/inventory` listed only `generatedRecipes.test.ts` (before commit); no schema or binding change; "ripple" appears nowhere in the new source.
- The full module run touched `claude_request.test.ts.snap` (line endings only, empty `git diff --ignore-cr-at-eol`); restored with `git restore`.

## Local publish evidence

Key before: `true | 108` (checked with `grep -qE "true +[|] +108"`).

Command, exactly: `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null` (exit 0). Output tail:

```
Uploading to local => http://127.0.0.1:3000
Checking for breaking changes...
Database Migration Plan
(empty: no migration step)

Publishing module...
Updated database with name: uwr, identity: c200f2029b92b15e2164adf6951b34cc614ea4063d36996c58cac1799244c14a
```

The migration plan is empty, as expected for a code-only change. The CLI printed its usual `tsc not found in node_modules` line before `Build finished successfully` (it was also present for the earlier local publishes of this phase; the build succeeded). No clear prompt, no refusal, no maincloud, no `--clear-database`, no push, no server started or stopped.

Key after: `true | 108`.

Log excerpt (`spacetime logs --server local uwr | tail -n 80`; zero lines match "panic"):

```
2026-10-06T21:08:37.930053Z  INFO: Database updated
2026-10-06T21:31:08.625532Z  INFO: Updated program to c464a2fcb240fb933bd7935a4b9d5d9a050268d831d397b0b207c6f0761be865
2026-10-06T21:31:08.626304Z  INFO: Database updated
```

Bindings: `pnpm spacetime:generate -y` finished successfully; `git status --porcelain src/module_bindings` is empty (unchanged, as expected).

Read-only check: `SELECT COUNT(*) AS n FROM recipe_template` returns `0` (stays 0 until the owner presses Discover). No reducer was called against the live database.

## Owner try-out note

Elfansworth is at Cormorant Stair. Reload Vite, open Crafting and press Discover recipes.

What he will discover with his bag as it is in the local database right now (read-only `spacetime sql`, 2026-10-06, after the publish). Non-equipped bag: Scrap Cloth x21, Copper Ore x4, Peat x9, Life Stone x3, Murky Water x4, Iron Shard x3, Stone x11, Lamp Oil x16, Herbs x7. Cormorant Stair is region Tessarine Shelf (danger 169, offset 0), so area level 1.

- First press: Copper Dagger (3 Copper Ore + 1 Scrap Cloth), Scrap Cloth Robe (3 Scrap Cloth + 1 Copper Ore), Stone Pendant (2 Stone + 1 Scrap Cloth).
- Second press: Herbal Draught (2 Herbs + 1 Murky Water; his Clear Water is gone from the bag, so the base is Murky Water) and Iron Shard Dagger (3 Iron Shard + 1 Scrap Cloth).
- Third press: "You discover nothing new."

I confirmed this order by running the pure rules module on exactly this bag (read-only; no reducer call): `gen:weapon:copper_ore+scrap_cloth:L1`, `gen:armor:scrap_cloth+copper_ore:L1`, `gen:accessory:stone+scrap_cloth:L1`, `gen:consumable:herbs+murky_water:L1`, `gen:weapon:iron_shard+scrap_cloth:L1`.

With his earlier 50-23 bag the first press gives Iron Shard Dagger, Scrap Cloth Robe and Stone Pendant and the second gives Herbal Draught. All outputs are level 1 (requiredLevel 1) and Elfansworth (dagger, wand, staff; cloth, leather) can equip every gear piece. Copper Ore x4 covers either the Copper Dagger (3) or the Scrap Cloth Robe (1) plus most of a dagger, not both daggers at once. Craft, Eat and Salvage are real changes to the local database. Generated templates are shared world rows; a second character at a station reuses them and only gets a recipe_discovered row.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 3 - Blocking] Plan frontmatter wave**
- **Found during:** start (orchestrator note)
- **Issue:** the plan said `wave: 2` with `depends_on: ["50-24"]`; 50-24 is wave 13.
- **Fix:** `wave: 14`.
- **Files modified:** 50-25-PLAN.md
- **Commit:** with this SUMMARY

No other deviations. The plan's line references predated the review fixes and 50-24, so every file was re-read and matched by content; the review fixes (merged-total `planCraft`, `craft_recipe` decorating the created instance, `addItemToInventory` returning the row) and the 50-24 vendor rules were used as they are and needed no change. No prompt, Keeper Bible or route text change; the word "ripple" is not in the new source.

## Known stubs

None.

## Threat flags

None beyond the plan's threat model (no new endpoint, table or trust boundary; `requireCharacterOwnedBy` is still the first call and a real-handler test shows another owner's call throws and inserts nothing).

## Deferred UAT (milestone end)

Pressing Discover recipes in the running client at Cormorant Stair and crafting one piece, one meal and salvaging a crafted piece (owner try-out above).

## Self-Check: PASSED

- Files exist: recipe_rules.ts, recipe_rules.test.ts, recipe_discovery.test.ts, generatedRecipes.test.ts, this SUMMARY.
- Commits exist: 48c44cb2, 5b616a90.
