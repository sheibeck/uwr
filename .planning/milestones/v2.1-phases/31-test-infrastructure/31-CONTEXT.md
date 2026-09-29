# Phase 31: Test Infrastructure - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Unified mock DB test infrastructure + regression test suites for 5 core systems: combat, inventory, intent routing, equipment generation, and event logging. Covers requirements TEST-01 through TEST-06. No tests for systems outside these 6 areas.

</domain>

<decisions>
## Implementation Decisions

### Test Organization
- Co-located test files (`*.test.ts` next to source files) — matches existing pattern
- Shared test utility file (e.g., `helpers/test-utils.ts`) with unified `createMockDb()` — eliminates duplication
- Refactor existing test files (`world_gen.test.ts`, `intent.test.ts`) to use the new shared mock
- `describe/it` naming with behavior descriptions (e.g., `it('applies crit multiplier when roll succeeds')`)

### Coverage Scope
- Strictly the 6 requirements: TEST-01 (mock DB), TEST-02 (combat), TEST-03 (inventory), TEST-04 (intent), TEST-05 (equipment gen), TEST-06 (event logging)
- No numeric coverage target — quality over quantity, test specific scenarios from success criteria
- Other backend systems get tests in their own phases

### Test Granularity
- Helper-level unit tests as the primary layer (test individual functions like calculateDamage, applyDot, etc.)
- A few integration-style flow tests for combat (e.g., attack with crit + DoT, healing + HoT, death triggers loot)
- Happy paths + key error cases (2-3 important error scenarios per area)
- Item/inventory tests at helper level, not reducer level

### Mock DB Design
- Proxy-based auto-creation pattern (auto-creates tables on access, no upfront registration)
- Pre-seeding support: `createMockDb({ character: [...], item: [...] })`
- Both `createMockDb()` and `createMockCtx()` (bundles db + timestamp + sender)
- Supports insert, find, filter, delete, update, iter operations

### Claude's Discretion
- Number of integration flow tests for combat
- Index strategy for mock DB (which indexes to pre-wire vs dynamic)
- Event logging test depth (verify emit calls vs full row insertion)
- Exact mock DB implementation details

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Follow existing Vitest patterns in the codebase.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- Vitest already configured in `spacetimedb/package.json` (`vitest ^3.2.1`, `npm test` → `vitest run`)
- Two existing test files with Proxy-based mock DB patterns to draw from:
  - `spacetimedb/src/helpers/world_gen.test.ts` — tests `writeGeneratedRegion`, `findHomeLocation`
  - `spacetimedb/src/reducers/intent.test.ts` — tests `buildLookOutput` with pre-seeded data

### Established Patterns
- Mock DB uses `new Proxy({}, handler)` with table-level operations (insert, id.find, iter, by_*.filter)
- Mock tx/ctx includes `{ db, timestamp: { microsSinceUnixEpoch } }`
- `vi.mock()` used for cross-module dependencies (e.g., mocking `../helpers/location`)
- Both existing mocks support auto-increment IDs via `0n` placeholder

### Integration Points
- Backend reducers: ~24 files in `spacetimedb/src/reducers/`
- Backend helpers: ~24 files in `spacetimedb/src/helpers/`
- Key targets: `helpers/combat.ts`, `helpers/combat_enemies.ts`, `helpers/combat_perks.ts`, `helpers/combat_rewards.ts`, `helpers/items.ts`, `helpers/economy.ts`, `helpers/events.ts`, `reducers/intent.ts`, `reducers/items.ts`
- Data layer: `spacetimedb/src/data/mechanical_vocabulary.ts` (stat types, formulas, effect vocabulary)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 31-test-infrastructure*
*Context gathered: 2026-03-09*
