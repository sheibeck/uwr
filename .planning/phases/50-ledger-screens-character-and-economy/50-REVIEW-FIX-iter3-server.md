---
phase: 50-ledger-screens-character-and-economy
fixed_at: 2026-10-07T05:40:00Z
review_path: .planning/phases/50-ledger-screens-character-and-economy/50-REVIEW-iter3-server.md
iteration: 3
findings_in_scope: 9
fixed: 4
skipped: 5
status: partial
---

# Phase 50: Code Review Fix Report (iteration 3, server)

**Fixed at:** 2026-10-07T05:40:00Z
**Source review:** `.planning/phases/50-ledger-screens-character-and-economy/50-REVIEW-iter3-server.md`
**Iteration:** 3

**Summary:**
- Findings in scope: 9 (1 Warning, 8 Info). The orchestrator set the scope for each finding.
- Fixed: 4 (WR-01, IN-02, IN-05, IN-07).
- Test added, behaviour unchanged: IN-03 (one parity test).
- Left as documented, as the orchestrator asked: IN-01, IN-04, IN-06, IN-08.

The fixes were made on `master` in the main checkout, with one commit per finding. All paths were staged explicitly. The tests need the installed `node_modules`, and the local publish runs from this checkout, so no worktree was used.

## Fixed Issues

### WR-01: `craft_recipe_count` can push the bag up to 99 rows over the 50-slot capacity in one call

**Commit:** `c05af917`

**Files modified:**
- `spacetimedb/src/data/inventory_rules.ts`
- `spacetimedb/src/data/inventory_rules.test.ts`
- `spacetimedb/src/data/crafting_rules.ts`
- `spacetimedb/src/data/crafting_rules.test.ts`
- `spacetimedb/src/reducers/items_crafting.ts`
- `spacetimedb/src/reducers/craft_count.test.ts`
- `src/crafting/craftingModel.ts`
- `src/crafting/craftingModel.test.ts`
- `src/crafting/RecipeDetail.vue` (comment only)

**Applied fix:**

*The shared rule, in `inventory_rules.ts`.* This is still import-free, next to `MAX_INVENTORY_SLOTS`. It adds `rowsSurelyEmptied`, `craftSlotsAfter` and `craftBatchFits`, which follow how `craftBatch` actually creates rows:
- A stackable output merges into a non-equipped stack that survives the consumes, and that costs no slot. Otherwise the whole batch takes one new row.
- A non-stackable output takes one row per craft.
- The rows the inputs empty are subtracted. The bound takes the biggest stacks first, so it holds whatever order the rows are walked in, and server and client agree even though their row order can differ.
- A batch fits when the rows after it are at most 50, or when it does not grow the bag at all. A merge into an over-full bag is allowed, as it is for buying.

*The server gate.* `craftBatch` (used by both `craft_recipe` and `craft_recipe_count`) runs `craftBatchFits` after `planCraft` passes and before any removal or add. It refuses through `fail()`:
- `Your backpack is full.` for a single craft. This is the same text as buy-back and the client.
- `Your backpack has no room for {count} more.` for a batch.

The stale "no capacity gate" comments in `items_crafting.ts` and `inventory_rules.ts` were replaced.

*`maxCraftCount`.* It takes an optional `room` (`{ fits(consumes, count) }`) and returns the largest n for which every batch from 1 to n fits. `crafting_rules.ts` has to stay import-free (an existing import-pin test enforces this), so the caller passes `craftBatchFits` in as a callback rather than the file importing it.

*The client.* The Max, the clamp and the Craft availability in `craftingModel.ts` now go through the same `craftBatchFits`:
- `craftQuantity` passes the room, built from the hub's item rows (`ledger.items`, the active character's rows, which is the same set the server reads by owner).
- `craftAvailability` uses it in place of the old order-dependent `itemsAfter` plus `hasBackpackSpace`.
- When only the bag stops a craft, the button reads "Backpack full", not "Missing materials".
- The recipe list's "Can make N" stays the materials-only number. It describes materials, and its "Missing …" fallback would be wrong for a bag limit.

*Change from the brief.* The brief said the client passes a free-slot count. The client passes the hub's rows instead. The existing client gate already counted the rows the consumed inputs free, so a bound on free slots alone would disable Craft in cases the server accepts.

**Tests:**
- *Shared rule:* `rowsSurelyEmptied` is the same in either row order; one row per non-stackable craft; consumed rows are freed; stack merge versus one new row; an equipped row is not a stack; an output stack the inputs consume completely; an over-full bag.
- *`maxCraftCount` with a room:* the room bounds the result; refusals stay at 0; the room receives the batch totals; the result stops at the first batch that does not fit.
- *Real handlers on the strict mock:*
  - At 49/50, counts 2 and 20 are refused with every table deep-equal.
  - At 50/50, `craft_recipe` is refused with "Your backpack is full.".
  - At 49/50, a count of 1 still crafts.
  - A batch fits because its inputs empty their rows.
  - A stackable batch merges into its stack at 50/50.
  - A stackable batch with no stack is refused.
  - A parity grid at 45, 48, 49 and 50 used: `maxCraftCount` with the room equals the server's limit, max succeeds and max + 1 is refused with nothing changed.
- *Client model:* Max is bounded by the free slots (5 free gives Max 5, an empty bag gives 48); freed rows are counted; a full bag reads "Backpack full"; a stack merge is unbounded; availability at the clamped count agrees with Max. The old "caps at 99" test now uses a stackable output, because a sword batch is now limited by the bag.

### IN-02: The reagent and scroll rolls are still linear in the timestamp and correlated with each other

**Commit:** `c4d45465`

**Files modified:**
- `spacetimedb/src/data/crafting_rules.ts`
- `spacetimedb/src/data/crafting_rules.test.ts`
- `spacetimedb/src/reducers/items_crafting.ts`
- `spacetimedb/src/reducers/salvage_result.test.ts`
- `spacetimedb/src/reducers/recipe_discovery.test.ts`

**Applied fix:**
- `salvage_item` computes one `salvageSeed(timestamp, instanceId, characterId)`. The components roll at indexes 0 to 2 through `rollSalvage`.
- The 12% reagent and the INT scroll now roll with `salvageRoll(seed, SALVAGE_REAGENT_ROLL_INDEX = 100n)` and `salvageRoll(seed, SALVAGE_SCROLL_ROLL_INDEX = 101n)`. These are fixed indexes that can never meet a component's, so no roll decides another.
- The 12% rate is unchanged. So is the reagent pick, `(instanceId + characterId) % defs.length`, which means the client preview needed no change.
- The `salvageRoll` doc and the 50-40 header now describe the new rolls.

**Tests:**
- The `salvage_result` and `recipe_discovery` timestamp finders now search through the new rolls.
- A new shared-rule test pins the two indexes (above the component range, and distinct from each other).
- Over 6000 fixed seeds it checks:
  - the reagent hit rate stays between 10% and 14%
  - no constant shift ties the scroll roll to the reagent roll
  - the joint hit rates of reagent with scroll, and of reagent with component, match the product of the single rates within 1.5%

### IN-05: `writeActionResult` throws a `SenderError` for a programming error

**Commit:** `49ec491c`

**Files modified:**
- `spacetimedb/src/helpers/action_result.ts`
- `spacetimedb/src/views/action_result.test.ts`

**Applied fix:**
- An unknown kind now throws a plain `Error('writeActionResult: unknown result kind …')`, and the `SenderError` import was removed.
- The test asserts the error is an `Error` and not a `SenderError`, checks the message, and checks that nothing was written.

### IN-07: Stale comments contradict the 50-40 rule

**Commit:** `8375ba1a`

**Files modified:**
- `spacetimedb/src/data/action_result.ts`
- `spacetimedb/src/data/crafting_rules.ts`

**Applied fix:**
- The `received` line kind is now described as "a salvage component that came back (a chance, never guaranteed)".
- The leftover "SALVAGE: one rule for salvage_item and the client preview" header was merged into the 50-40 header block, and `SALVAGE_REAGENT_CHANCE_PCT` moved under it. This is a comment and declaration-order change only.

## Test added, behaviour unchanged

### IN-03: Server and client salvage inputs diverge in two edge cases, and no test feeds one fixture through both

**Commit:** `15b131dd` (test only)

**Files modified:** `spacetimedb/src/reducers/salvage_result.test.ts`

**What the test does:** it runs the real `salvage_item` on the strict mock at a timestamp where every component and the reagent hit, and compares the granted `received` lines and the `bonus` line with `src/ledger/salvagePreview.ts` for the same template, recipe and affixes. It covers two fixtures:
- a recipe-made chest with three inputs
- a chest no recipe makes, where the client names the slot material without a template id, so only the name and amount are compared

The templates carry the MATERIAL_DEFS vendor values, as `ensureStarterItemTemplates` upserts them. The client module is loaded through a non-literal dynamic import, so the server type check never pulls in client code.

**Behaviour:** unchanged. The two documented divergences (a missing part template, and one recipe versus all recipes) stay as the review recorded them.

## Left as documented (no code change, as the orchestrator asked)

### IN-01: The bonus reagent sits outside the "never worth more than the item" cap
**File:** `spacetimedb/src/reducers/items_crafting.ts`; `spacetimedb/src/data/crafting_rules.ts`
**Reason:** The orchestrator asked for no behaviour change. It is not a loop, because reagents are never recipe inputs (pinned by `salvage_loop.test.ts`).
**Original issue:** The 12% reagent's value comes on top of the full-luck component value cap.

### IN-04: If two recipes ever make one template, the value cap does not follow the cheapest recipe
**File:** `spacetimedb/src/data/crafting_rules.ts`
**Reason:** The orchestrator asked for no behaviour change. It is unreachable today, because each generated key has its own output template.
**Original issue:** The components come from the lowest-id recipe, but the value cap uses the item's own `vendorValue`.

### IN-06: The result card's `rarity` for a gear craft reads the row from before decoration
**File:** `spacetimedb/src/reducers/items_crafting.ts`
**Reason:** The orchestrator asked for no behaviour change. It is invisible today, because every generated output is common.
**Original issue:** `lastRow?.qualityTier` is read before `decorateCrafted` sets it.

### IN-08: Salvage and craft ignore pending trade offers (pre-existing; latent)
**File:** `spacetimedb/src/reducers/items_crafting.ts`; `spacetimedb/src/reducers/items_trading.ts`
**Reason:** The orchestrator asked for no behaviour change. It is latent, because no client calls the trade reducers.
**Original issue:** `finalizeTrade` drops missing instances and moves whole current stacks.

## Verification

- **Touched tests:** they all pass:
  - `craft_count`
  - `crafting_rules`
  - `inventory_rules`
  - `craft_quality`
  - `recipe_discovery`
  - `salvage_result`
  - `salvage_loop`
  - `item_rules_parity`
  - `views/action_result`
  - `data/action_result`
  - `craftingModel`
  - `CraftingScreen`
  - `generatedRecipes`
  - `salvagePreview`
  - `gameDataAlias`
- **`npx vue-tsc -b`:** clean (exit 0).
- **`npx tsc --noEmit -p spacetimedb` errors:** they are all pre-existing kinds, either `node:` types in test files or implicit `any` in reducer callbacks. None is new in the touched code.
- **Full `npx vitest run`:** 279 files passed and 3 failed. Tests: 8939 passed and 2 failed. The failures are only the baseline ones:
  - `scripts/llm/call_log_report.test.mjs`
  - `scripts/llm/proof_rules.test.mjs`
  - `spacetimedb/src/helpers/measurement.results.test.ts`
- **Guards:**
  - No `replaceAll`, `.at(`, `Object.hasOwn` or "ripple" in the added lines.
  - The reducers stay deterministic: every roll comes from the ctx timestamp seed.
  - Player-facing refusals use `fail()`.
  - LF line endings are preserved, and no new file names were added.

## Publish (local only)

- **Key check before:** `spacetime sql uwr "SELECT * FROM admin_llm_status" --server local` matched `true | 108` (`key_valid` true). It also matched again just before publishing.
- **Publish:** `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null`. The build succeeded and the migration plan was empty: no schema change and no clear asked for. The database was updated (`uwr`, program `c68470ac…`).
  - `--clear-database` was not used. Nothing was published to maincloud, and nothing was pushed.
- **Key check after:** `key_set true | key_length 108 | key_valid true`, which matches the guard.
- **Bindings:** not regenerated, because no reducer signature changed.
- **Processes:** the SpacetimeDB server (PID 12020, :3000) and Vite (:5173) are still running. No background processes were started.

---

_Fixed: 2026-10-07T05:40:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 3_
