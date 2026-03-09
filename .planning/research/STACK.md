# Technology Stack

**Project:** UWR v2.1 Project Cleanup
**Researched:** 2026-03-09
**Focus:** Stack additions for dynamic equipment generation, combat balance, UI scaling, and unit testing

## Verdict: No New Dependencies Required

The v2.1 milestone is a cleanup and polish milestone. Every feature in scope can be built with the existing stack plus proper configuration of what is already installed. Adding libraries would contradict the milestone's purpose.

---

## Existing Stack (Validated, Do Not Change)

| Technology | Version | Purpose |
|------------|---------|---------|
| SpacetimeDB | 1.12.0 | Backend runtime |
| TypeScript | 5.6.2 | Language |
| Vue 3 | 3.5.13 | Frontend framework |
| Vite | 6.4.1 | Build tool |
| spacetimedb npm | ^2.0.1 | SDK (both client and server) |
| Vitest | ^3.2.1 | Backend test runner (already in spacetimedb/package.json) |
| Cloudflare Workers + Hono | (llm-proxy/) | LLM proxy |

---

## What Each v2.1 Feature Needs

### 1. Dynamic Equipment Generation (Power-Scaled Loot Drops, Quest Rewards)

**Needs:** Nothing new. The system already exists.

`helpers/items.ts` already contains:
- `rollQualityTier()` with tier-based rarity weights and danger multiplier scaling
- `rollQualityForDrop()` with quality (craftsmanship) axis
- `generateAffixData()` with prefix/suffix selection from `affix_catalog.ts`
- `buildDisplayName()` for composed item names
- `getWorldTier()` mapping level bands to tiers (T1-T5)
- Full `TIER_RARITY_WEIGHTS` and `TIER_QUALITY_WEIGHTS` tables

The mechanical vocabulary in `mechanical_vocabulary.ts` already defines:
- All equipment slots, armor types, weapon types
- Quality tiers (common through legendary)
- Craft qualities (dented through mastercraft)
- Affix stats and types
- Material tiers and affinities

**What v2.1 work actually involves:** Wiring the existing generation functions into combat victory rewards and quest completion handlers. This is reducer-level integration work, not library work. The loot tables, affix system, and power scaling formulas already exist as pure functions.

**Confidence:** HIGH -- read the source directly.

### 2. Combat Balance Tooling

**Needs:** Nothing new.

Combat balance is about tuning constants that already exist in:
- `data/combat_scaling.ts` -- weapon crit multipliers, stat scaling rates, crit caps
- `data/combat_constants.ts` -- weapon speeds, two-handed types
- `mechanical_vocabulary.ts` -- threat config, global damage multiplier, AoE scaling
- `helpers/items.ts` -- tier rarity/quality weight tables

Balance "tooling" for this project means:
1. Unit tests that assert expected damage ranges at key level breakpoints
2. Pure functions that compute expected DPS given stat/gear inputs (testable without DB)
3. Possibly a dev-mode reducer or admin command to spawn test encounters

No dashboard, no visualization library, no analytics pipeline. This is a small multiplayer RPG with a handful of players, not a live-service game needing Grafana.

**Confidence:** HIGH -- scope is clear from PROJECT.md.

### 3. UI Scaling (Global Font Size)

**Needs:** Nothing new.

The current UI uses inline JS style objects (`src/ui/styles.ts`) with `rem` units extensively. A global font size control means:
1. Add a CSS custom property on `:root` (e.g., `--base-font-size`) or change `html { font-size }` dynamically
2. Store preference in `localStorage`
3. Expose a slider in settings

Since the styles already use `rem` units, changing the root font size scales everything automatically. This is vanilla CSS + a Vue reactive ref. No library needed.

**Do NOT add:** css-vars-ponyfill, any CSS-in-JS library, any UI component library. The existing inline style approach works and consistency matters more than switching paradigms mid-project.

**Confidence:** HIGH -- verified styles use rem units.

### 4. Unit Testing Infrastructure

**Needs:** Vitest is already installed. Needs configuration and test files, not new dependencies.

Current state:
- `spacetimedb/package.json` has `vitest: ^3.2.1` in devDependencies with `"test": "vitest run"` script
- Two test files exist: `world_gen.test.ts` and `intent.test.ts`
- Tests use a Proxy-based mock DB pattern that simulates SpacetimeDB table operations
- No `vitest.config.ts` exists (uses defaults, which work)
- No frontend tests exist

**Backend testing approach (keep the existing Proxy pattern):**
The existing Proxy-based `createMockDb()` pattern is the right approach for SpacetimeDB. Since reducers interact with `ctx.db` which is a Proxy object in the runtime, mocking it with another Proxy gives realistic behavior. Do NOT introduce a real SpacetimeDB test instance -- the WASM runtime is not designed for unit testing.

**Frontend testing:**
Do NOT add frontend unit tests in v2.1. Rationale:
- The frontend is thin -- it reads `useTable()` data and calls reducers. Logic lives in the backend.
- Vue component testing requires `@vue/test-utils`, `jsdom`/`happy-dom`, and mocking the entire SpacetimeDB connection. High setup cost, low value for a UI that is mostly rendering subscription data.
- The v2.1 scope explicitly focuses on backend cleanup, dead code removal, and combat fixes. Frontend tests add scope creep.
- If frontend tests are later needed, add `@vue/test-utils` + `happy-dom` at that time.

**Backend testing plan:**
- Extract pure functions from reducers (damage calculation, loot rolls, stat computation) into testable helpers
- Test those helpers with the existing mock DB pattern
- Add a `vitest.config.ts` only if needed (default config finds `*.test.ts` files fine)

**Confidence:** HIGH -- existing tests run, pattern is established.

---

## What NOT to Add

| Temptation | Why Not |
|------------|---------|
| Zod / io-ts for LLM response validation | Mechanical vocabulary already constrains valid values. Schema validation happens via TypeScript types. Adding a runtime validator adds a dependency for something `includes()` checks handle. |
| Lodash / Ramda | No utility library needed. The codebase uses native array methods throughout. |
| Chart.js / D3 for balance visualization | Over-engineering. Log output + unit test assertions are sufficient for balance tuning. |
| @vue/test-utils + happy-dom | Not in v2.1 scope. Frontend is thin. Add when needed. |
| Tailwind / UnoCSS | Would require rewriting all inline styles. Consistency > convenience. |
| Pinia state management | SpacetimeDB subscriptions via `useTable()` ARE the state management. Adding Pinia would duplicate state. |
| Any ORM or query builder | SpacetimeDB has its own table API. No ORM applies. |
| ESLint / Prettier | Good idea eventually, but adding linting to a 52K LOC codebase mid-cleanup creates noise. Do this as a separate initiative. |

---

## Configuration Changes (No New Packages)

### Optional: vitest.config.ts for backend

Only create if needed for custom behavior. Current defaults work.

```typescript
// spacetimedb/vitest.config.ts (only if needed)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

### Font scaling CSS

```css
/* Add to index.html or App.vue global styles */
:root {
  --base-font-size: 16px;
}
html {
  font-size: var(--base-font-size);
}
```

```typescript
// In a composable or settings handler
function setFontSize(px: number) {
  document.documentElement.style.setProperty('--base-font-size', `${px}px`);
  localStorage.setItem('uwr-font-size', String(px));
}
```

---

## Alternatives Considered

| Category | Decision | Alternative | Why Not |
|----------|----------|-------------|---------|
| Test runner | Vitest (already installed) | Jest | Vitest already works, native ESM support matches the SpacetimeDB TS project |
| Test mocking | Proxy-based createMockDb | Real SpacetimeDB instance | WASM runtime not designed for test harnesses; Proxy mock is fast and reliable |
| Font scaling | CSS custom property on :root | CSS zoom / transform scale | zoom is non-standard; transform breaks layout; rem-based scaling is the correct approach |
| Equipment generation | Existing pure functions in helpers/items.ts | LLM-generated items | LLM is too slow and expensive for loot drops; deterministic functions with affix system already provide variety |
| Balance tooling | Unit tests + constant tuning | Admin dashboard | Overkill for current player count; unit tests are faster feedback loop |

---

## Sources

- `spacetimedb/package.json` -- confirmed vitest ^3.2.1 installed
- `spacetimedb/src/helpers/items.ts` -- confirmed equipment generation functions exist (rollQualityTier, generateAffixData, etc.)
- `spacetimedb/src/data/mechanical_vocabulary.ts` -- confirmed full item/equipment vocabulary
- `spacetimedb/src/data/combat_scaling.ts` -- confirmed combat balance constants
- `spacetimedb/src/helpers/world_gen.test.ts` -- confirmed Proxy mock DB pattern
- `spacetimedb/src/reducers/intent.test.ts` -- confirmed test infrastructure works
- `src/ui/styles.ts` -- confirmed rem-based inline styles
- `.planning/PROJECT.md` -- confirmed v2.1 scope and existing stack
