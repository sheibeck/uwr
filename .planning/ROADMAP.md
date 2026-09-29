# Roadmap: UWR

## Milestones

- ✅ **v1.0 MVP** -- Phases 1-23 (shipped 2026-02-25)
- ✅ **v2.0 The Living World** -- Phases 24-30 (shipped 2026-03-09)
- 🚧 **v2.1 Project Cleanup** -- Phases 31-38 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-23) -- SHIPPED 2026-02-25</summary>

See `.planning/milestones/v1.0-ROADMAP.md` for full details (if archived).

- Phases 1-23: Character creation, combat, inventory, crafting, quests, NPCs, world events, renown, travel, death/corpse, config tables, auth, subscription optimization

</details>

<details>
<summary>✅ v2.0 The Living World (Phases 24-30) -- SHIPPED 2026-03-09</summary>

- [x] Phase 24: LLM Pipeline Foundation (3/3 plans) -- completed 2026-03-07
- [x] Phase 25: Narrative UI Shell (3/3 plans) -- completed 2026-03-07
- [x] Phase 26: Narrative Character Creation (3/3 plans) -- completed 2026-03-07
- [x] Phase 27: Procedural World Generation (3/3 plans) -- completed 2026-03-07
- [x] Phase 28: Dynamic Skill Generation (3/3 plans) -- completed 2026-03-07
- [x] Phase 29: NPC & Quest Generation (3/3 plans) -- completed 2026-03-07
- [x] Phase 30: Narrative Combat (4/4 plans) -- completed 2026-03-09

See `.planning/milestones/v2.0-ROADMAP.md` for full details.

</details>

### 🚧 v2.1 Project Cleanup (In Progress)

**Milestone Goal:** Stabilize, polish, and complete the v2.0 foundation -- remove dead code, add tests, wire remaining v1.0 systems into narrative UI, and fix combat gaps.

- [x] **Phase 31: Test Infrastructure** - Unified mock DB, combat regression tests, and test coverage across core systems (completed 2026-03-09)
- [x] **Phase 32: Dead Code Removal** - Purge v1.0 legacy files, extract implicit rules, deduplicate code, clean imports (completed 2026-03-09)
- [ ] **Phase 33: Combat Improvements** - Complete combat logging, enemy effect indicators, balance tuning, multi-pull verification
- [ ] **Phase 34: Narrative UI Integration** - Sell commands, hotbar in narrative UI, event feed styling
- [ ] **Phase 35: Dynamic Equipment Generation** - Level-scaled equipment drops replacing hardcoded gear definitions
- [x] **Phase 36: Ability Expansion** - Extend ability kinds to cover all game systems with server and client dispatch (completed 2026-03-10)
- [ ] **Phase 37: UX Polish** - Global font scaling and group info readability
- [ ] **Phase 38: Platform Upgrade** - SpacetimeDB 2.10, TS 6 / Vite 8 / Vitest 5 tooling, llm-proxy deps, pnpm-only lockfile (runs next)

## Phase Details

### Phase 31: Test Infrastructure

**Goal**: Developers can safely modify combat, inventory, and intent routing with confidence that regressions are caught
**Depends on**: Nothing (first phase of v2.1)
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06
**Success Criteria** (what must be TRUE):

  1. A single shared mock DB utility exists and all test files use it (no duplicate mock implementations)
  2. Combat test suite catches regressions in damage formulas, healing, DoT/HoT tick values, death triggers, and crit calculations
  3. Item/inventory tests verify equip, unequip, sell (with perk bonuses), and drop flows
  4. Intent routing tests verify command parsing dispatches to correct handlers for all registered commands
  5. Equipment generation tests verify rarity rolling, affix selection, and stat scaling produce valid items

**Plans**: 3 plans

Plans:

- [ ] 31-01-PLAN.md -- Shared mock DB utility, refactor existing tests, event logging tests
- [ ] 31-02-PLAN.md -- Combat regression tests (formulas, effects, attack outcomes)
- [ ] 31-03-PLAN.md -- Item/inventory tests, equipment generation tests, intent routing tests

### Phase 32: Dead Code Removal

**Goal**: Codebase is smaller, cleaner, and free of v1.0 legacy artifacts -- every remaining file is actively used
**Depends on**: Phase 31 (tests verify nothing breaks during removal)
**Requirements**: CLEAN-01, CLEAN-02, CLEAN-03, CLEAN-04, CLEAN-05, CLEAN-06
**Success Criteria** (what must be TRUE):

  1. All files listed in MEMORY.md deletion list are removed and the project compiles without errors
  2. Implicit mechanical rules from item_defs.ts (armor class restrictions, stat ranges, slot vocabulary) are captured in mechanical_vocabulary.ts
  3. Backend has no duplicated sell/combat/economy logic -- shared helpers exist and all call sites use them
  4. Frontend has no redundant components doing the same thing (legacy panels alongside narrative equivalents removed)
  5. Import graph is clean -- no broken or circular imports after all removals

**Plans**: 3 plans

Plans:

- [ ] 32-01-PLAN.md -- Extract mechanical rules to domain-specific files, rewire all importers
- [ ] 32-02-PLAN.md -- Delete legacy backend files, seeding system, deduplicate logic, remove dead reducers
- [ ] 32-03-PLAN.md -- Delete legacy frontend panels, clean App.vue, remove orphaned composables

### Phase 33: Combat Improvements

**Goal**: Players see complete, informative combat feedback and encounter balanced difficulty
**Depends on**: Phase 31 (combat tests enable safe rebalancing), Phase 32 (clean codebase)
**Requirements**: COMB-01, COMB-02, COMB-03, COMB-04, COMB-05, COMB-06, COMB-07
**Success Criteria** (what must be TRUE):

  1. Player sees per-tick damage/healing entries in the combat log with effect name and amount for every DoT and HoT
  2. Player sees buff/debuff application and expiration entries in the combat log with stat, magnitude, and duration
  3. Enemy HUD shows active DoT, HoT, and debuff icons with remaining duration countdown
  4. Player can engage multiple enemy groups simultaneously without combat state corruption
  5. Damage and healing constants are tuned and validated by passing test assertions

**Plans**: 5 plans

Plans:

- [ ] 33-01-PLAN.md -- Combat log narrative messages, buff/debuff lifecycle events, balance tuning
- [ ] 33-02-PLAN.md -- Multi-enemy pull fixes, remove puller role restriction
- [ ] 33-03-PLAN.md -- Enemy HUD effect indicators with color coding and duration countdown
- [ ] 33-04-PLAN.md -- Gap closure: fix CREATION_ABILITY_SCHEMA field mismatch (effect -> kind)
- [ ] 33-05-PLAN.md -- Gap closure: enable mid-combat pull via narrative enemy clicks

### Phase 34: Narrative UI Integration

**Goal**: Players can sell items, manage multiple named hotbars, and use abilities outside combat entirely through the narrative console with styled event feedback
**Depends on**: Phase 32 (dead code removed, shared helpers exist)
**Requirements**: NARR-01, NARR-02, NARR-03, NARR-04, NARR-05
**Success Criteria** (what must be TRUE):

  1. Player can type `sell <item>` and the item is sold with correct gold calculation including perk bonuses
  2. Player can type `sell all junk` or `sell 3 <item>` for bulk sales with a summary of what was sold
  3. Hotbar is visible at all times (not just combat) showing ability slots with cooldown timers
  4. Player can create multiple named hotbars, switch between them with arrows, and manage slots via commands
  5. Event feed entries are color-coded by kind (combat=red, reward=gold, system=gray, social=blue)

**Plans**: 3 plans

Plans:

- [ ] 34-01-PLAN.md -- Fix sell perk bonus, add sell all junk and sell N commands, complete event colors
- [ ] 34-02-PLAN.md -- Hotbar schema (Hotbar parent table), server reducers, intent commands
- [ ] 34-03-PLAN.md -- Persistent hotbar UI, multi-hotbar navigation, remove bottom action bar

### Phase 35: Dynamic Equipment Generation

**Goal**: Equipment drops are unique, level-appropriate, and dynamically generated -- no more selecting from a static pool
**Depends on**: Phase 32 (mechanical vocabulary extracted), Phase 33 (combat math stabilized)
**Requirements**: EQUIP-01, EQUIP-02, EQUIP-03, EQUIP-04, EQUIP-05
**Success Criteria** (what must be TRUE):

  1. Defeating an enemy drops equipment with stats scaled to enemy level and world tier
  2. Generated equipment stats (AC, damage, bonuses) are computed from formulas, not looked up from hardcoded tables
  3. Quest reward equipment is dynamically generated matching the quest difficulty tier
  4. The static WORLD_DROP_GEAR_DEFS constant is gone, replaced by a generation function
  5. Generated equipment names use the existing prefix/suffix affix system

**Plans**: TBD

Plans:

- [ ] 35-01: TBD
- [ ] 35-02: TBD

### Phase 36: Ability Expansion

**Goal**: The ability system covers all game systems with diverse ability types, pure buffs/debuffs, functional race abilities, per-level heritage bonuses, and renown perks unified into the dynamic ability system
**Depends on**: Phase 32 (mechanical vocabulary complete), Phase 33 (combat dispatch stable)
**Requirements**: ABIL-01, ABIL-02, ABIL-03, ABIL-04, ABIL-05, ABIL-06, ABIL-07, ABIL-08, ABIL-09, ABIL-10, ABIL-11
**Success Criteria** (what must be TRUE):

  1. mechanical_vocabulary.ts includes ability kinds for combat, crafting, gathering, travel, social, songs, auras, pets, fear, and summoning
  2. Server dispatch handles all new ability kinds without hardcoded special cases
  3. Pure buff abilities (stat boosts, haste) and pure debuff abilities (slow, fear) work without damage components and are castable outside combat
  4. Race abilities are functional in-game (minor passive/active effects, not just narrative text)
  5. Heritage bonuses apply every level and are shown during character creation and level-up
  6. Renown perks use the dynamic ability system with LLM-driven selection at rank-up
  7. Abilities track source (Class, Renown, Race) for display and filtering
  8. Client ability dispatch renders and activates all new ability kinds without hardcoded special cases

**Plans**: 5 plans

Plans:

- [ ] 36-01-PLAN.md -- Vocabulary expansion (new ABILITY_KINDS), schema (source/abilityKey columns), BASE_BUDGET entries
- [ ] 36-02-PLAN.md -- Heritage bonus every-level fix, race ability data definitions
- [ ] 36-03-PLAN.md -- Server dispatch for all new kinds, pure buff/debuff fix, LLM skill gen expansion, race ability granting
- [ ] 36-04-PLAN.md -- Renown perks as dynamic abilities, PendingRenownPerk table, LLM perk generation flow
- [ ] 36-05-PLAN.md -- Client-side renown perk choice UI (header notification, perk selection in console)

### Phase 37: UX Polish

**Goal**: Players can customize text size for comfortable reading across all UI elements
**Depends on**: Nothing (independent of other phases)
**Requirements**: UX-01, UX-02, UX-03, COMB-08
**Success Criteria** (what must be TRUE):

  1. Player can increase and decrease the global font size of the entire application
  2. Font size preference persists across browser sessions via localStorage
  3. Group info panel text is sized for readability at all font scale settings

**Plans**: TBD

Plans:

- [ ] 37-01: TBD

### Phase 38: Platform Upgrade

**Goal**: The project runs on current, supported versions of SpacetimeDB and all frameworks, with no behaviour regressions, before further feature work
**Depends on**: Nothing (runs next, ahead of 33-35 and 37)
**Requirements**: TBD
**Research**: `.planning/notes/platform-upgrade-research.md`
**Success Criteria** (what must be TRUE):

  1. SpacetimeDB CLI, server SDK, and client SDK are on 2.10.x; bindings regenerated; module publishes locally without `--clear-database`
  2. Client connection error handling works under the 2.10 `onDisconnect`/`onConnectError` change; scheduled-table logic does not rely on strict execution order
  3. Tooling upgraded: TypeScript pinned to ~6.0 (not 7), vue-tsc 3, Vite 8, plugin-vue 6, Vitest 5 (root and `spacetimedb/`), Vue 3.5 latest
  4. llm-proxy upgraded (hono, openai 7, wrangler, workers-types) and a `/api/llm` call succeeds under `wrangler dev`
  5. pnpm is the single package manager: `pnpm-lock.yaml` regenerated, stray root `package-lock.json` removed, `engines.node >=22.12` declared
  6. `pnpm build` and all test suites pass; the game runs locally end to end
  7. Stale SpacetimeDB rules in CLAUDE.md (tested-with 1.11.x, index `name:`, multi-column index warning) updated to match 2.10

**Plans**: 8 plans

Plans:
**Wave 1**

- [ ] 38-01-PLAN.md — Wave 0A: fix buildLookOutput tests, root test script, 2.10 connection logging (SC-2), HotbarDisplaySlot unification, vue-tsc clean outside App.vue
- [ ] 38-02-PLAN.md — Wave 0B: App.vue vue-tsc clean (14 real errors, 92 unused), restores number-key hotbar shortcuts

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 38-03-PLAN.md — SpacetimeDB 2.10.1: verified data/config backup, CLI install, SDKs via pnpm (spacetimedb/ + root), regenerate bindings, local publish with --break-clients

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 38-04-PLAN.md — Vitest 5 in spacetimedb/ + scheduled-table concurrency audit (SC-2)

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 38-05-PLAN.md — llm-proxy: smoke script + baseline, pnpm conversion, hono/openai 7/wrangler/workers-types 5, real /api/llm call

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 38-06-PLAN.md — Root toolchain: Vue 3.5.43, then TS ~6.0.3 + vue-tsc 3, then Vite 8 + plugin-vue 6 + Vitest 5; retire root pnpm-workspace.yaml

**Wave 6** *(blocked on Wave 5 completion)*

- [ ] 38-07-PLAN.md — engines >=22.12, pnpm-only assertions, README/PROJECT tech refresh, CLAUDE.md + AGENTS.md 2.10 rules

**Wave 7** *(blocked on Wave 6 completion)*

- [ ] 38-08-PLAN.md — Consolidated SC gate, local stack bring-up, human end-to-end verification

## Progress

**Execution Order:**
Phase 38 (Platform Upgrade) runs next, then remaining phases in numeric order: 38 -> 33 -> 34 -> 35 -> 37

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-23 | v1.0 | All | Complete | 2026-02-25 |
| 24-30 | v2.0 | 22/22 | Complete | 2026-03-09 |
| 31. Test Infrastructure | 3/3 | Complete    | 2026-03-09 | - |
| 32. Dead Code Removal | 3/3 | Complete    | 2026-03-09 | - |
| 33. Combat Improvements | 4/5 | In Progress|  | - |
| 34. Narrative UI Integration | v2.1 | 0/3 | Not started | - |
| 35. Dynamic Equipment Generation | v2.1 | 0/? | Not started | - |
| 36. Ability Expansion | 5/5 | Complete   | 2026-03-10 | - |
| 37. UX Polish | v2.1 | 0/? | Not started | - |
| 38. Platform Upgrade | v2.1 | 0/? | Not started | - |

---
*Last updated: 2026-09-29 after adding phase 38 (platform upgrade)*
