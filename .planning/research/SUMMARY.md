# Project Research Summary

**Project:** UWR v2.1 -- Project Cleanup
**Domain:** Browser RPG (SpacetimeDB + Vue 3), cleanup/polish milestone
**Researched:** 2026-03-09
**Confidence:** HIGH

## Executive Summary

UWR v2.1 is a cleanup and polish milestone for an existing browser RPG built on SpacetimeDB (TypeScript backend) and Vue 3 (SPA client). The codebase is 52K+ lines with significant technical debt from v1.0/v2.0: duplicated logic between intent router and reducers, zero unit tests on the 2,767-line combat engine, 7+ data files marked for deletion that are still imported by 18+ consumers, and a legacy panel UI running alongside the newer narrative console. No new dependencies are needed -- the existing stack (SpacetimeDB 1.12, Vue 3, Vite, Vitest) covers every v2.1 feature.

The recommended approach is test-first, cleanup-second, features-third. The single highest-risk area is the combat engine: it has no tests, touches every game system, and multiple v2.1 features (rebalancing, logging, equipment generation) modify it. Building test infrastructure first -- specifically a unified mock DB utility and pure-function extraction from combat.ts -- enables safe changes everywhere else. Dead code removal comes second because it reduces the surface area for all subsequent work, but it must be done methodically (one file at a time, import-traced, compile-verified) due to the stale deletion list and dynamic reducer references.

The hardest feature is dynamic equipment generation, but 80% of the infrastructure already exists (rarity rolling, affix generation, quality tiers, tier weight tables). The gap is a ~200-300 line function to generate item_template rows from formulas rather than selecting from a static pool. This must wait until mechanical constraints from the existing item_defs.ts are extracted into mechanical_vocabulary.ts and validated server-side. Everything else (sell integration, hotbar, font scaling, combat logging) is low-to-medium complexity wiring work.

## Key Findings

### Recommended Stack

No new dependencies. The existing stack handles all v2.1 requirements. See [STACK.md](STACK.md) for full analysis.

**Core technologies (all existing):**
- **SpacetimeDB 1.12.0**: Backend runtime -- server-authoritative, table subscriptions drive all client state
- **Vue 3 + Vite**: SPA client -- thin layer that renders useTable() data and calls reducers
- **Vitest 3.2.1**: Already installed, two test files exist with Proxy-based mock DB pattern
- **Cloudflare Workers + Hono**: LLM proxy -- unchanged for v2.1

**Explicitly rejected:** Zod, Lodash, Chart.js, @vue/test-utils, Tailwind, Pinia, ESLint. Each has a specific rationale in STACK.md. The key principle: SpacetimeDB subscriptions ARE the state management, and the existing inline style approach should not be replaced mid-milestone.

### Expected Features

See [FEATURES.md](FEATURES.md) for full landscape with complexity estimates.

**Must have (table stakes):**
- Sell items via narrative command -- reducers exist but intent router duplicates logic and misses perk bonuses
- Combat log completeness -- DoT ticks, HoT ticks, buff/debuff apply/expire, shield absorption all missing
- DoT/HoT/debuff indicators on enemies -- combat_enemy_effect table exists, client needs rendering
- Hotbar visible in narrative UI -- composable exists, legacy panel uses outdated API
- Equipment drops scaled to level -- generation functions exist, gap is dynamic item_template creation
- Dead code removal -- 15+ files identified, but deletion list is stale vs. current imports

**Should have (differentiators):**
- Power-scaled dynamic equipment generation -- unique drops per encounter, 80% infrastructure built
- Narrative event feed styling -- color-coded events by kind (combat/reward/system/social)
- Global font scale control -- CSS custom property + rem-based scaling, low effort
- Narrative sell experience -- Keeper-narrated transactions

**Defer to v2.2:**
- Ability type expansion for non-combat systems -- new kinds (craft_boost, gather_boost, travel_speed) require vocabulary + dispatch + tests, too much scope for cleanup milestone

### Architecture Approach

Two-tier architecture: SpacetimeDB tables/reducers as source of truth, Vue 3 SPA as reactive renderer. All mutations flow through reducers. Client subscribes via useTable(). No optimistic UI. See [ARCHITECTURE.md](ARCHITECTURE.md) for component map.

**Key patterns to follow:**
1. **Extract-and-delegate** -- duplicated logic (sell in intent.ts vs. sell_item reducer) must be extracted to shared helpers
2. **Server-authoritative kind dispatch** -- all ability kinds resolve through resolveAbility() on server, client calls useAbility uniformly (remove client-side kind interception in useHotbar.ts)
3. **Event-driven UI** -- server emits granular events, client renders them; no optimistic state

**Files to create:** `helpers/economy.ts` (shared sell logic), `composables/useSettings.ts` (font scale)
**Files to potentially delete:** `HotbarPanel.vue` (legacy, uses outdated abilityKey API)

### Critical Pitfalls

See [PITFALLS.md](PITFALLS.md) for all 13 pitfalls with prevention strategies.

1. **Deleting still-imported data files** -- 18+ server files and 1+ client file import from the "dead" data files. Trace ALL imports (both snake_case and camelCase) before any deletion. Migrate consumers first, delete one file at a time, compile-verify each.
2. **Breaking combat during rebalancing** -- 2,767-line file with zero tests and cascading formula dependencies. Write combat tests BEFORE any constant changes. Extract pure functions for isolated testing.
3. **Dynamic equipment producing invalid items** -- item_defs.ts encodes implicit rules (armor class restrictions, stat ranges, slot vocabulary) not yet in mechanical_vocabulary.ts. Extract rules first, validate server-side, extend existing affix system.
4. **Test mock divergence from SpacetimeDB** -- two independent mock implementations exist. Unify into shared test-utils.ts before writing new tests. Prioritize pure function tests that need no mocking.
5. **Combat logging revealing hidden bugs** -- adding log entries will expose incorrect effect calculations. Budget 2x time for "log + investigate + fix" per effect type.

## Implications for Roadmap

Based on combined research, here is the recommended phase structure. The ordering is driven by dependency chains and risk mitigation.

### Phase 1: Test Infrastructure
**Rationale:** Every subsequent phase needs safe change validation. Combat rebalancing, dead code removal, and equipment generation all risk breaking existing behavior. Tests must come first.
**Delivers:** Unified mock DB utility (merged from 2 existing implementations), pure function extraction from combat.ts, combat regression test suite covering damage formulas, crit calculation, stat scaling, DoT/HoT tick values.
**Addresses:** Foundation for all features; directly prevents Pitfalls #2 (combat breakage), #6 (mock divergence), #7 (hidden effect bugs)
**Avoids:** Pitfall #6 -- unify mocks before proliferating test files with independent mock implementations

### Phase 2: Dead Code Removal
**Rationale:** Reduces 52K+ LOC surface area before any feature work. Every subsequent phase benefits from less confusion and fewer stale imports. Must come after test infrastructure so removal can be verified.
**Delivers:** Removal of legacy v1.0 components, unused seeded data files, obsolete reducers. Clean import graph.
**Addresses:** Dead code removal (table stakes), partial HotbarPanel.vue cleanup
**Avoids:** Pitfalls #1 (still-imported files), #3 (dynamically-referenced code), #11 (client imports from server data), #13 (stale bindings)

### Phase 3: Combat Improvements
**Rationale:** Combat is the core gameplay loop. Log completeness and balance fixes must precede equipment generation (which feeds into combat rewards). Tests from Phase 1 enable safe constant changes.
**Delivers:** Complete combat logging (DoT/HoT ticks, buff/debuff apply/expire, shield absorption, CC events), enemy effect display on client, balance constant tuning with test verification, multi-enemy pull verification.
**Addresses:** Combat log completeness (table stakes), DoT/HoT indicators (table stakes), multi-enemy pull verification (differentiator)
**Avoids:** Pitfalls #2 (rebalancing without tests), #7 (hidden effect bugs), #12 (multi-pull edge cases)

### Phase 4: Narrative UI Integration
**Rationale:** With dead code removed and combat stabilized, wire remaining legacy panel features into the narrative console. Extract shared logic to eliminate duplication.
**Delivers:** Sell via narrative command (with shared economy helper), hotbar management in narrative UI, event feed styling by kind. Intent routes added before UI migration.
**Addresses:** Sell items (table stakes), hotbar in narrative UI (table stakes), narrative event feed (differentiator), narrative sell experience (differentiator)
**Avoids:** Pitfall #5 (losing functionality during UI migration)

### Phase 5: Dynamic Equipment Generation
**Rationale:** Depends on stable combat math (Phase 3) and clean codebase (Phase 2). The 80% existing infrastructure means this is primarily a formula-writing and validation task, not a greenfield build.
**Delivers:** generateItemTemplate() function for on-the-fly equipment creation, level-scaled stat formulas, server-side validation against mechanical vocabulary, integration with combat victory rewards.
**Addresses:** Equipment drops scaled to level (table stakes), power-scaled dynamic equipment (differentiator)
**Avoids:** Pitfall #4 (invalid/overpowered items)

### Phase 6: UX Polish
**Rationale:** Independent of all other phases. Low risk. Can ship at any point but logically fits as final polish.
**Delivers:** Global font scale control (CSS custom property + localStorage + settings UI), any remaining visual polish.
**Addresses:** Global font scale (differentiator)
**Avoids:** Pitfall #9 (font scaling breaking layout) -- audit CSS units before implementing

### Phase Ordering Rationale

- **Tests before changes:** Phase 1 enables safe work in Phases 2-5. Without tests, combat rebalancing and dead code removal are high-risk guesswork.
- **Cleanup before features:** Phase 2 removes noise and stale code so Phases 3-5 operate on a clean codebase with accurate import graphs.
- **Combat before equipment:** Phase 3 stabilizes the combat math that Phase 5's equipment generation feeds into. Equipment stat formulas must be tuned against a known-good combat engine.
- **Narrative integration is independent:** Phase 4 touches different files (intent.ts, economy helper, Vue components) than Phases 3 and 5. It could run in parallel with Phase 3 if resources allowed.
- **Polish last:** Phase 6 is purely cosmetic and can ship whenever convenient.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (Test Infrastructure):** The unified mock DB needs careful design to cover all index types (btree, unique, named). Review both existing test files to enumerate all mock patterns needed.
- **Phase 5 (Dynamic Equipment):** Stat scaling formulas (AC per tier, damage per level) need to be derived from existing item_defs.ts data points. This is reverse-engineering work, not library research.

Phases with standard patterns (skip research-phase):
- **Phase 2 (Dead Code Removal):** Mechanical process -- trace imports, migrate consumers, delete, compile. No unknowns.
- **Phase 4 (Narrative UI Integration):** Pattern is established (extract helper, add intent route, wire UI). Architecture research already mapped every file change.
- **Phase 6 (UX Polish):** CSS custom properties on :root is a well-documented pattern. Styles already use rem units.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Direct codebase analysis. No new dependencies needed -- nothing to research. |
| Features | HIGH | Every feature traced to existing code with line-number specificity. Complexity estimates grounded in LOC counts. |
| Architecture | HIGH | Component map built from actual import graph. Patterns derived from existing codebase conventions. |
| Pitfalls | HIGH | Pitfalls sourced from real code analysis (import tracing, file sizes, existing test patterns). Not speculative. |

**Overall confidence:** HIGH -- All research was conducted against the actual codebase, not external documentation or community patterns. The project is an existing system being cleaned up, not a greenfield build with unknowns.

### Gaps to Address

- **Stat scaling formulas for dynamic equipment:** The existing item_defs.ts has hardcoded stats per item. The formulas to compute those stats from (level, tier, slot, armor_type) don't exist yet. Phase 5 planning must derive these formulas by analyzing the existing data points.
- **Combat effect correctness:** Pitfall #7 warns that adding combat logs will reveal hidden bugs. The actual bug count is unknown until logging is added. Phase 3 should budget buffer time for discovered issues.
- **Client-side import from server data files:** Only one case is confirmed (useCrafting.ts -> crafting_materials.ts), but others may exist. Phase 2 planning should do a comprehensive cross-boundary import audit.
- **HotbarPanel.vue disposition:** Research identified it as legacy (uses outdated abilityKey API) but a firm delete-vs-update decision needs to be made during Phase 4 planning.

## Sources

### Primary (HIGH confidence -- direct codebase analysis)
- `spacetimedb/src/helpers/items.ts` -- equipment generation functions (467 LOC)
- `spacetimedb/src/helpers/combat.ts` -- combat engine (1,322 LOC)
- `spacetimedb/src/reducers/combat.ts` -- combat reducers (2,767 LOC)
- `spacetimedb/src/data/mechanical_vocabulary.ts` -- game mechanics vocabulary
- `spacetimedb/src/data/combat_scaling.ts` -- damage formulas, stat scaling
- `spacetimedb/src/data/item_defs.ts` -- static item definitions (294 LOC)
- `spacetimedb/src/reducers/intent.ts` -- text command routing (1,297 LOC)
- `spacetimedb/src/helpers/world_gen.test.ts` -- existing test pattern (176 LOC)
- `spacetimedb/src/reducers/intent.test.ts` -- existing test pattern (235 LOC)
- `src/ui/styles.ts` -- inline style system with rem units
- `.planning/PROJECT.md` -- v2.1 scope definition
- `MEMORY.md` -- v2.0 architecture rules and deletion list

---
*Research completed: 2026-03-09*
*Ready for roadmap: yes*
