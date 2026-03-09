# Domain Pitfalls

**Project:** UWR v2.1 -- Project Cleanup
**Domain:** Dead code removal, dynamic equipment generation, narrative UI integration for legacy systems, combat rebalancing, test coverage addition
**Researched:** 2026-03-09
**Overall Confidence:** HIGH (direct codebase analysis, established software engineering patterns)

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or broken production deployments.

---

### Pitfall 1: Deleting Seeded Data Files That Are Still Imported

**What goes wrong:** The MEMORY.md lists 7+ data files and the `seeding/` directory for deletion, but 18 server files currently import from them (combat.ts, creation.ts, items.ts, intent.ts, items_crafting.ts, items_gathering.ts, llm.ts, schema/tables.ts, helpers/items.ts, helpers/location.ts, helpers/travel.ts, helpers/world_gen.ts, and more). One frontend file (`useCrafting.ts`) also imports from `crafting_materials.ts`. Deleting data files without first removing every import path causes the module to fail compilation. SpacetimeDB publishes break silently -- the WASM bundle fails to build but the old module stays running, masking the error until someone checks logs.

**Why it happens:** The deletion list in MEMORY.md was created during v2.0 planning. Since then, code continued to reference these files for starter items, crafting recipes, named enemies, combat constants, and world event definitions. The "delete these" list is stale relative to actual import graphs.

**Consequences:** Failed publish to maincloud. If `--clear-database` was used with a broken module, data loss with no rollback.

**Prevention:**
1. Before deleting ANY data file, run `grep -r "filename" spacetimedb/src/ --include="*.ts"` AND `grep -r "filename" src/ --include="*.ts" --include="*.vue"` to find ALL consumers (server and client).
2. Migrate consumers FIRST (replace hardcoded data with table lookups or mechanical vocabulary references), verify the module compiles and publishes locally, THEN delete the data file.
3. Never combine `--clear-database` with a publish that also deletes code. Publish the code change first, verify it works, then clear if schema requires it.
4. Delete one file at a time, compile, publish locally, test. Not batch deletes.

**Detection:** `spacetime publish` fails. Check with `spacetime logs uwr` for compilation errors.

**Phase:** Dead code removal. Must be sequenced AFTER migration of each consumer.

---

### Pitfall 2: Breaking the Combat Engine During Rebalancing

**What goes wrong:** `combat.ts` is 2,767 lines -- the largest reducer file by far. It imports from `combat_scaling`, `combat_constants`, `crafting_materials`, `renown_data`, `world_event_data`, and 8 helper files (totaling ~3,200 additional lines). Changing any combat constant (damage multipliers, stat scaling, crit formulas) has cascading effects across auto-attacks, abilities, enemy AI, threat calculation, loot drops, world event contributions, and perk procs. A "small balance tweak" in one formula silently breaks a different combat path.

**Why it happens:** Combat has grown organically through v1.0 and v2.0 with real-time, round-based (reverted), and data-driven ability dispatch layered on top. The 2,767-line file has zero unit tests. Only 2 test files exist in the entire backend (world_gen.test.ts at 176 lines and intent.test.ts at 235 lines, each with their own independent mock infrastructure).

**Consequences:** Players die unexpectedly, enemies become unkillable, loot stops dropping, world events stop progressing. All silent until a player reports it because there are no tests to catch regressions.

**Prevention:**
1. Write combat unit tests BEFORE making any balance changes. Test the specific formula being changed.
2. Extract pure functions from combat.ts (damage calculation, crit roll, threat calculation, stat scaling) into testable helpers. Many of these are already in `combat_scaling.ts` and `helpers/combat.ts` -- test those directly.
3. Never change more than one combat constant per commit. Publish locally and test a full combat encounter before moving to the next.
4. Create a "combat regression" test suite that exercises: auto-attack damage range, ability damage with each kind, crit calculation, threat distribution, loot drop rates, DoT/HoT tick values.

**Detection:** Combat log entries showing unexpected damage values. Players reporting instant death or unkillable enemies.

**Phase:** Combat tests must come BEFORE combat rebalancing. These are two separate phases that must be strictly ordered.

---

### Pitfall 3: Removing Dead Code That Is Not Actually Dead

**What goes wrong:** Code that appears unused (no direct imports, no grep hits) is actually invoked dynamically through SpacetimeDB reducer name strings, Vue component dynamic registration, or snake_case-to-camelCase conversion at the client boundary. Removing it breaks runtime behavior without any compile-time warning.

**Why it happens:** In this codebase specifically:
- Reducers are registered by string name (`spacetimedb.reducer('sell_item', ...)`) and called from the client as `conn.reducers.sellItem()`. Grepping for `sell_item` won't find `sellItem`, and vice versa. Both variants must be searched.
- `CharacterPanel.vue` is still imported in `App.vue`. `useCharacterCreation.ts` is still referenced. These appear "legacy" but may be active fallback paths.
- The hotbar system spans `HotbarPanel.vue`, `useHotbar.ts`, and backend reducers. It looks like a standalone module but connects to the combat action bar, character info panel, and the combat lock composable.

**Consequences:** Features silently stop working. No compile errors, only runtime failures that surface when a player tries to use the feature.

**Prevention:**
1. For every file marked "dead," trace BOTH the TypeScript import AND the runtime reference. Check: is this reducer name called from any client code (try both snake_case and camelCase)? Is this component mounted in any template?
2. Before deleting, add a `console.warn('DEPRECATED: [filename] still reached')` and publish locally. Play-test for 10 minutes. If the warning fires, the code is not dead.
3. Delete in small batches (1-2 files per commit), publish, test. Not all at once.
4. Keep a "quarantine" branch: move suspected dead code to an unimported file first. If nothing breaks after a play session, delete for real.

**Detection:** Features that worked yesterday stop working. No compile errors visible.

**Phase:** Dead code removal. Must be methodical, not a bulk delete.

---

### Pitfall 4: Dynamic Equipment Generation Producing Invalid or Overpowered Items

**What goes wrong:** When replacing hardcoded `item_defs.ts` (294 lines of curated items, armor class restrictions, weapon types) with dynamically generated equipment, the generated items violate mechanical constraints: wrong slot names, stats not in `CHARACTER_STATS`, armor types not in the vocabulary, or stat values that break combat math (e.g., +500 armor on a level 1 drop).

**Why it happens:** The existing `item_defs.ts` encodes implicit rules that are NOT yet in `mechanical_vocabulary.ts`:
- `ARMOR_ALLOWED_CLASSES` -- which armor types each class can wear
- `STARTER_WEAPON_DEFS` -- valid weapon types and their class restrictions
- Implicit stat value ranges per level (a level 1 sword gives +2 str, not +200)
- Equipment slot vocabulary (head, chest, legs, feet, hands, weapon, shield, ring, amulet)
- Quality tier stat multipliers (already partially in `helpers/items.ts` via `rollQualityTier` and `generateAffixData`)

The LLM has no guardrails unless these constraints are explicitly encoded in prompts AND validated server-side.

**Consequences:** Items that crash the equip reducer (unknown slot), items that make characters invincible (stat overflow), items unusable by any class (wrong armor type), items with garbage display names that break the UI.

**Prevention:**
1. Before removing `item_defs.ts`, extract its mechanical rules into `mechanical_vocabulary.ts`: valid equipment slots, armor types, weapon types, stat ranges per level bracket, class-armor compatibility.
2. Server-side validation in the item insert/equip reducer: clamp stats to level-appropriate ranges, reject unknown slot/type values, validate against `mechanical_vocabulary.ts`.
3. The existing `generateAffixData()` and `rollQualityTier()` in `helpers/items.ts` (467 lines) already handle affix generation and power budgets. EXTEND these functions rather than replacing them -- they encode hard-won balance logic.
4. Write unit tests for the item validation before enabling dynamic generation. Test edge cases: max level items, minimum level items, items with every stat type.

**Detection:** Equip reducer throwing errors. Players with absurd stat totals. Items with `undefined` in their display names.

**Phase:** Dynamic equipment generation. Must define and test constraints BEFORE enabling generation.

---

## Moderate Pitfalls

---

### Pitfall 5: Narrative UI Integration Losing Functionality

**What goes wrong:** When moving sell-items, hotbar, and event systems from panel-based UI into the narrative console, the functionality works differently (or not at all) because the narrative UI processes commands through the intent router (`intent.ts`, 1,297 lines) while the panel UI called reducers directly via button clicks. Commands that worked as button clicks now need to be parsed from natural language, and the intent router may not have routes for them.

**Why it happens:** v2.0 built the narrative console and intent router for NEW features (look, travel, talk, combat). Legacy features (sell, hotbar management, event browsing) were left in their panel UIs. Wiring them into the narrative system requires adding intent routes AND inline UI rendering, not just moving Vue components.

**Prevention:**
1. For each legacy system being integrated, check `intent.ts` for existing command routes. If none exist, the intent route must be added BEFORE the UI migration.
2. Keep the panel UI functional as a fallback until the narrative version is verified end-to-end. Don't delete the panel component until the narrative command works with actual typed input.
3. Test with actual typed commands in the narrative console, not just code review. "sell sword" needs to: parse -> find the item in inventory -> call the sell reducer -> show gold received in the narrative log.
4. Some features (like hotbar management with drag-and-drop) may not translate well to a text interface. Decide upfront: does this stay as a panel overlay triggered from narrative, or does it become a text command?

**Phase:** Narrative rework phase. Intent routes first, then UI, then old panel removal.

---

### Pitfall 6: Test Infrastructure Fighting SpacetimeDB Mocking

**What goes wrong:** Adding unit tests to a SpacetimeDB TypeScript backend requires mocking the entire `ctx.db` proxy -- every table's index accessors, insert/update/delete/find/filter methods, and `ctx.sender`/`ctx.timestamp` context. The two existing test files each independently implement their own `createMockDb()` -- a hand-rolled Proxy-based mock that simulates table operations. These mocks are incomplete (they don't cover all index types or named indexes consistently), duplicated, and brittle.

**Why it happens:** SpacetimeDB has no official test harness for TypeScript modules. The module code runs inside a WASM runtime and cannot be imported in a Node.js test environment. Every test must hand-mock the database layer.

**Consequences:** Tests that pass but don't reflect real SpacetimeDB behavior (mock diverges from actual semantics). Massive boilerplate per test file. Mock maintenance burden grows with every new table or index. Developers avoid writing tests because the setup is too painful.

**Prevention:**
1. Extract and unify `createMockDb()` into a shared `test-utils.ts` FIRST, before writing any new tests. The two existing implementations (`world_gen.test.ts` and `intent.test.ts`) should be merged and made comprehensive.
2. The unified mock must support: `insert` (with auto-inc), `find` (unique), `filter` (btree index), `update`, `delete`, `iter`, and arbitrary named indexes matching the schema (e.g., `by_owner`, `by_location`, `by_spawn`).
3. Test pure logic functions separately from reducer integration tests. Pure functions (damage formulas, stat calculations, affix generation, power budget math) don't need the db mock at all -- prioritize these.
4. Consider a mock builder pattern: `createMockDb().withTable('character', [...rows]).withIndex('by_location', 'locationId')` to reduce boilerplate.

**Detection:** Tests pass but production behavior differs. Tests break every time a new table or index is added to the schema.

**Phase:** Must be the FIRST phase in the milestone. Test infrastructure enables safe changes in all subsequent phases (combat rebalancing, dead code removal, equipment generation).

---

### Pitfall 7: Combat Log Completeness Revealing Hidden Effect Bugs

**What goes wrong:** When adding missing combat log entries (DoT tick damage, HoT tick healing, debuff applications, buff expirations, multi-enemy threat changes), the logs reveal that effects were not actually being applied correctly. What starts as "add a log line for DoT ticks" becomes "fix DoT ticks because they're calculating damage wrong" which cascades into "rebalance DoT abilities because the fix changed their effective DPS."

**Why it happens:** Without logging, incorrect behavior is invisible. The combat engine processes DoTs, HoTs, buffs, and debuffs in the tick scheduler (`helpers/combat.ts`, 1,322 lines). If a DoT was silently dealing double damage or a HoT was healing for 0, nobody noticed because there was no log entry. Adding the log is the moment of discovery.

**Prevention:**
1. Accept this upfront. Budget combat log work as "log + investigate + fix" not just "add log entry." Each missing log entry is a potential bug discovery.
2. When adding a log entry for an effect, verify the effect's actual numeric impact matches the expected formula. Compare the logged value against what `combat_scaling.ts` says it should be.
3. Write a test for each effect type's calculation BEFORE adding the log. That way the test catches the discrepancy, not the live log.

**Detection:** Logged values that seem wrong: DoT dealing more damage than the ability's tooltip, HoT healing for 0, buffs lasting forever.

**Phase:** Combat improvements. Budget 2x the time you think logging will take.

---

### Pitfall 8: Ability Type Expansion Without Engine Handlers

**What goes wrong:** Adding new ability kinds to `ABILITY_KINDS` in `mechanical_vocabulary.ts` without updating the combat engine's kind-based dispatch map. The LLM generates abilities with the new kind, players acquire them via level-up, and using them in combat does nothing -- the dispatch map has no handler for the new kind.

**Why it happens:** The v2.0 architecture replaced the 106-case switch with a kind-based dispatch map. Adding a new kind to the vocabulary is a one-line change. Adding the corresponding engine handler requires understanding the combat flow, effect system, tick scheduling, threat calculation, and stat math. The vocabulary change and engine change live in different files with no compile-time link between them.

**Consequences:** Abilities that show "no effect" in combat. Players waste their one-per-level skill choice on a broken ability. Trust in the skill system collapses.

**Prevention:**
1. For each new ability kind: (a) define the kind in vocabulary, (b) implement the dispatch handler in the combat engine, (c) write a unit test for the handler, (d) THEN enable it in LLM prompts. All four steps in the same commit.
2. Gate new kinds behind a "generation-ready" list. The LLM prompt template should only offer kinds that appear in a `GENERATION_READY_KINDS` array, separate from `ABILITY_KINDS`. A kind is added to the generation-ready list only after its handler and test exist.
3. Keep a mapping table in comments or documentation: kind -> handler function -> test file. If any column is empty, the kind is not ready for generation.

**Detection:** Abilities that produce no combat log entry when used. Players reporting "my skill does nothing."

**Phase:** Ability expansion. Must pair vocabulary changes with engine changes in lockstep.

---

### Pitfall 9: Font Scaling Breaking Layout

**What goes wrong:** Adding a global font size control causes layout breakage because the UI mixes `px`, `rem`, `em`, and hardcoded dimensions. Some elements scale with the font, others don't, creating overlapping text, clipped panels, and broken grid layouts.

**Why it happens:** The existing UI was built at a fixed scale. Panel dimensions, padding, grid sizes, icon sizes, and border-radius values likely use mixed units across 30+ Vue components. A global scale multiplier only affects `rem`/`em`-based values, leaving `px` values unchanged -- creating a mismatch.

**Prevention:**
1. Audit all CSS units BEFORE implementing the scale control. Convert absolute `px` values to `rem` where they should scale (text, padding, margins). Leave structural `px` values (borders, shadows, icon sizes) as-is.
2. Implement the scale as a CSS custom property on `:root` (e.g., `--font-scale: 1.0`) applied to the root `font-size`. Only `rem`-based values will scale automatically.
3. Test at extremes: 0.75x and 1.5x. Focus on the narrative console, combat HUD, and panel overlays -- these are the most layout-sensitive components.
4. The `NarrativeConsole.vue`, `NarrativeHud.vue`, and `NarrativeInput.vue` are the most critical -- they're the primary interface. Test these first.

**Detection:** Visual inspection at non-default scales. Text overflowing containers, panels overlapping, scrollbars appearing where they shouldn't.

**Phase:** UX polish. Low risk if unit audit is done first.

---

## Minor Pitfalls

---

### Pitfall 10: Import Path Breakage During Deduplication

**What goes wrong:** Moving or merging files during deduplication/refactoring breaks import paths across the codebase. With 10,689 lines of reducers and 6,819 lines of helpers, a single moved file can break 10+ import statements across both server and client.

**Prevention:** After any file move or rename, run TypeScript compilation (`npx tsc --noEmit`) to catch all broken imports before publishing. Move one file at a time, not batches. Use IDE refactoring tools that update imports automatically when available.

**Phase:** Architecture refactoring. Every move must be followed by a compile check.

---

### Pitfall 11: Client-Side Imports From Server Data Files

**What goes wrong:** The architecture rule in MEMORY.md says "Import from `spacetimedb/src/data/` for any client-side constants that mirror server data." Currently `useCrafting.ts` imports from `crafting_materials.ts`. If that data file is deleted or restructured during dead code removal, the CLIENT breaks -- not the server. This is easy to miss because server-side grep catches server consumers but not client consumers.

**Prevention:** Before deleting any server data file, ALWAYS check the client import graph too: `grep -r "filename" src/ --include="*.ts" --include="*.vue"`. Migrate client consumers to table-driven approaches or move shared constants to a dedicated shared location.

**Detection:** Client build fails after server data file deletion. Vite will catch this at build time, but only if you run `npm run build`.

**Phase:** Dead code removal. Check BOTH server AND client imports for every deletion.

---

### Pitfall 12: Multi-Enemy Pull Edge Cases Without Test Coverage

**What goes wrong:** The combat system supports pulling multiple enemies (`PULL_ALLOW_EXTERNAL_ADDS = true`, `PULL_ADD_DELAY_ROUNDS = 2n`). "Verifying" this works correctly requires testing complex state transitions across multiple enemy spawn members, threat tables, tick scheduling, and concurrent combat encounters. Manual testing is unreliable because timing is non-deterministic and edge cases (pull during existing combat, pull when group is split across locations) are hard to reproduce.

**Prevention:** Write focused tests for multi-pull scenarios using the unified mock infrastructure. Mock the scheduled tick and simulate: (a) pull while in combat, (b) pull while group members are in different locations, (c) pull timing with `PULL_ADD_DELAY_ROUNDS`. Don't declare "verified" without automated tests.

**Phase:** Combat improvements. Requires test infrastructure from the first phase.

---

### Pitfall 13: Stale Module Bindings After Schema Changes

**What goes wrong:** Dead code removal or schema changes (adding/removing tables, changing columns) make the generated client bindings (`src/module_bindings/`) stale. The client compiles against old bindings and calls reducers with wrong argument shapes or references deleted tables. Errors only appear at runtime as failed reducer calls.

**Prevention:** After ANY schema change, regenerate bindings immediately: `spacetime generate --lang typescript --out-dir src/module_bindings -p spacetimedb`. Add this to the development checklist. Consider a pre-commit hook or CI check that verifies bindings match the current schema.

**Detection:** Client-side errors like "reducer not found" or "unexpected argument" at runtime.

**Phase:** Every phase that touches the schema (dead code removal, equipment generation, ability expansion).

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Test infrastructure setup | Mock db diverges from real SpacetimeDB; duplicated mock code | Unify mocks into shared test-utils.ts, test pure functions separately (#6) |
| Dead code removal | Files still imported by 18+ server consumers and 1+ client consumer | Trace ALL imports (both codebases) before deleting (#1, #11) |
| Dead code removal | Dynamically referenced reducers/components appear unused | Search both snake_case and camelCase, add deprecation warnings before deleting (#3) |
| Dynamic equipment generation | Items violate implicit rules from item_defs.ts | Extract rules to mechanical_vocabulary.ts, validate server-side, extend existing affix system (#4) |
| Narrative UI integration | Intent router missing routes for sell/hotbar/events | Add intent routes before UI migration, keep panel fallback (#5) |
| Combat rebalancing | 2,767-line file with zero tests, cascading formula changes | Write tests BEFORE changing any constants (#2) |
| Combat log completeness | Logs reveal underlying effect calculation bugs | Budget as "log + investigate + fix," write tests first (#7) |
| Ability type expansion | New kinds without engine dispatch handlers | Gate behind generation-ready list, require handler + test per kind (#8) |
| Global font scaling | Mixed CSS units cause layout breakage | Audit and normalize units before implementing control (#9) |
| Schema changes (any phase) | Client bindings become stale | Regenerate bindings after every schema change (#13) |

---

## Recommended Phase Ordering (Based on Pitfall Dependencies)

1. **Test infrastructure** -- enables safe changes in all subsequent phases
2. **Dead code removal** -- reduces surface area before adding new features
3. **Combat tests + rebalancing** -- tests first, then constant changes
4. **Dynamic equipment generation** -- vocabulary + validation + tests before generation
5. **Narrative UI integration** -- intent routes + UI + old panel removal
6. **Ability type expansion** -- vocabulary + handler + test per kind
7. **UX polish (font scaling, group info)** -- CSS audit, low risk
8. **Combat log completeness** -- budget for bug discovery

Key ordering constraints:
- Test infrastructure MUST precede combat rebalancing (Pitfall #2)
- Dead code import tracing MUST precede any data file deletion (Pitfall #1)
- Mechanical vocabulary extraction MUST precede dynamic equipment (Pitfall #4)
- Intent route addition MUST precede narrative UI migration (Pitfall #5)

---

## Sources

- Direct codebase analysis: import graphs across 18 server consumers and 1 client consumer of data files
- File size measurements: combat.ts (2,767 LOC), helpers/ (6,819 LOC total), reducers/ (10,689 LOC total)
- Existing test patterns analyzed: world_gen.test.ts (176 LOC), intent.test.ts (235 LOC) -- both use independent Proxy-based mock db
- MEMORY.md deletion list cross-referenced against current import graph
- item_defs.ts analyzed for implicit rules (armor class restrictions, weapon types, starter equipment)
- mechanical_vocabulary.ts analyzed for current coverage vs. gaps
- Combat system import chain traced: combat.ts -> combat_scaling, combat_constants, crafting_materials, renown_data, world_event_data + 8 helper files
