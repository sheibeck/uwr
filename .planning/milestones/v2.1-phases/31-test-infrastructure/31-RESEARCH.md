# Phase 31: Test Infrastructure - Research

**Researched:** 2026-03-09
**Domain:** Vitest unit testing for SpacetimeDB TypeScript backend
**Confidence:** HIGH

## Summary

This phase creates a unified mock DB utility and regression test suites for five core backend systems: combat, inventory, intent routing, equipment generation, and event logging. The project already has Vitest 3.2.1+ configured with two existing test files that use Proxy-based mock DB patterns. The primary work is extracting and generalizing the existing mock patterns into a shared utility, then writing focused unit tests for pure/near-pure helper functions.

The codebase is well-suited for unit testing because most game logic lives in `helpers/*.ts` files as exported functions that take a `ctx` object (with `ctx.db`, `ctx.timestamp`, `ctx.sender`). These functions can be tested by providing a mock context without needing SpacetimeDB runtime. The existing two test files already demonstrate this pattern successfully.

**Primary recommendation:** Extract the Proxy-based mock DB from `world_gen.test.ts` and `intent.test.ts` into `helpers/test-utils.ts`, add dynamic index resolution, then write co-located `*.test.ts` files targeting exported helper functions rather than reducers.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Co-located test files (`*.test.ts` next to source files) -- matches existing pattern
- Shared test utility file (e.g., `helpers/test-utils.ts`) with unified `createMockDb()` -- eliminates duplication
- Refactor existing test files (`world_gen.test.ts`, `intent.test.ts`) to use the new shared mock
- `describe/it` naming with behavior descriptions (e.g., `it('applies crit multiplier when roll succeeds')`)
- Strictly the 6 requirements: TEST-01 (mock DB), TEST-02 (combat), TEST-03 (inventory), TEST-04 (intent), TEST-05 (equipment gen), TEST-06 (event logging)
- No numeric coverage target -- quality over quantity, test specific scenarios from success criteria
- Helper-level unit tests as the primary layer (test individual functions like calculateDamage, applyDot, etc.)
- A few integration-style flow tests for combat (e.g., attack with crit + DoT, healing + HoT, death triggers loot)
- Happy paths + key error cases (2-3 important error scenarios per area)
- Item/inventory tests at helper level, not reducer level
- Proxy-based auto-creation pattern (auto-creates tables on access, no upfront registration)
- Pre-seeding support: `createMockDb({ character: [...], item: [...] })`
- Both `createMockDb()` and `createMockCtx()` (bundles db + timestamp + sender)
- Supports insert, find, filter, delete, update, iter operations

### Claude's Discretion
- Number of integration flow tests for combat
- Index strategy for mock DB (which indexes to pre-wire vs dynamic)
- Event logging test depth (verify emit calls vs full row insertion)
- Exact mock DB implementation details

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TEST-01 | Backend has unified mock DB test infrastructure (single reusable pattern) | Mock DB design section below; two existing implementations to merge; Proxy-based pattern verified working |
| TEST-02 | Combat engine has regression tests covering damage, healing, effects, death | Combat functions identified: `rollAttackOutcome`, `abilityDamageFromWeapon`, `addCharacterEffect`, `resolveAbility`, `applyArmorMitigation`, `applyVariance`, `calculateStatScaledAutoAttack`, `calculateCritChance`, `getCritMultiplier`, `calculateHealingPower`, `applyMagicResistMitigation` |
| TEST-03 | Item/inventory reducers have unit tests covering equip, unequip, sell, drop | Helper functions identified: `addItemToInventory`, `removeItemFromInventory`, `getEquippedBonuses`, `getEquippedWeaponStats`, `getItemCount`, `hasInventorySpace`, `getInventorySlotCount` |
| TEST-04 | Intent routing has tests covering command parsing and dispatch | Intent reducer uses regex matching + string comparison dispatch; existing `intent.test.ts` tests `buildLookOutput` but not routing itself |
| TEST-05 | Equipment generation has tests covering rarity rolling, affix selection, stat scaling | Pure functions identified: `rollQualityTier`, `rollQualityForDrop`, `generateAffixData`, `buildDisplayName`, `getWorldTier` |
| TEST-06 | Event logging has tests verifying all event types are emitted correctly | Event functions identified: `appendWorldEvent`, `appendLocationEvent`, `appendPrivateEvent`, `appendGroupEvent`, `appendCreationEvent`, `appendNpcDialog`, `logPrivateAndGroup`, `fail` |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | ^3.2.1 (installed: 4.0.18) | Test runner + assertions | Already configured in project; `npm test` runs `vitest run` |

### Supporting
No additional libraries needed. Vitest includes `describe`, `it`, `expect`, `vi.mock()`, `vi.fn()`, `vi.spyOn()` -- everything required for this phase.

**Installation:**
```bash
# No installation needed -- vitest already in devDependencies
cd spacetimedb && npm test  # runs vitest run
```

## Architecture Patterns

### Recommended Project Structure
```
spacetimedb/src/
  helpers/
    test-utils.ts          # NEW: shared createMockDb(), createMockCtx()
    combat.test.ts         # NEW: combat regression tests
    combat_enemies.test.ts # NEW: armor mitigation, variance, enemy stats
    items.test.ts          # NEW: inventory helpers
    events.test.ts         # NEW: event logging
    world_gen.test.ts      # EXISTING: refactor to use shared mock
  reducers/
    intent.test.ts         # EXISTING: refactor to use shared mock, add routing tests
  data/
    combat_scaling.test.ts # NEW: pure formula tests (optional, low priority)
```

### Pattern 1: Shared Mock DB with Proxy Auto-Creation
**What:** A single `createMockDb()` that auto-creates tables on access via `Proxy`, supports pre-seeding, and handles all index patterns used in the codebase.
**When to use:** Every test file imports from `./test-utils.ts`.

```typescript
// helpers/test-utils.ts
import { vi } from 'vitest';

export function createMockDb(seed: Record<string, any[]> = {}) {
  const tables: Record<string, any[]> = {};
  const nextIds: Record<string, bigint> = {};

  // Pre-seed
  for (const [k, v] of Object.entries(seed)) {
    tables[k] = [...v];
    // Track max ID for auto-increment
    let maxId = 0n;
    for (const row of v) {
      if (row.id !== undefined && row.id > maxId) maxId = row.id;
    }
    nextIds[k] = maxId + 1n;
  }

  function getTable(name: string): any[] {
    return (tables[name] ??= []);
  }
  function getNextId(name: string): bigint {
    const id = nextIds[name] ?? 1n;
    nextIds[name] = id + 1n;
    return id;
  }

  // Build index accessor for a given column
  function indexFor(tableName: string, column: string) {
    return {
      filter: (value: any) =>
        getTable(tableName).filter((r: any) => r[column] === value),
      find: (value: any) =>
        getTable(tableName).find((r: any) => r[column] === value),
      update: (row: any) => {
        const arr = getTable(tableName);
        const idx = arr.findIndex((r: any) => r[column] === row[column]);
        if (idx >= 0) arr[idx] = row;
      },
      delete: (value: any) => {
        const arr = getTable(tableName);
        const idx = arr.findIndex((r: any) => r[column] === value);
        if (idx >= 0) arr.splice(idx, 1);
      },
    };
  }

  // Column name mapping from index name: by_owner -> ownerCharacterId or ownerId, etc.
  const INDEX_TO_COLUMN: Record<string, string> = {
    by_owner: 'ownerCharacterId',
    by_location: 'locationId',
    by_character: 'characterId',
    by_from: 'fromLocationId',
    by_to: 'toLocationId',
    by_combat: 'combatId',
    by_instance: 'instanceId',
    by_vendor: 'vendorNpcId',
    by_event: 'eventId',
    by_spawn: 'spawnId',
    by_name: 'name',
    by_player: 'playerId',
    by_score: 'score',
    by_group: 'groupId',
  };

  return new Proxy({} as any, {
    get: (_: any, tableName: string) => {
      if (tableName === '_tables') return tables;
      return new Proxy({} as any, {
        get: (_: any, prop: string) => {
          if (prop === 'insert') {
            return (row: any) => {
              const r = { ...row };
              // Auto-increment: replace 0n IDs
              if (r.id === 0n) r.id = getNextId(tableName);
              if (r.scheduledId === 0n) r.scheduledId = getNextId(tableName);
              getTable(tableName).push(r);
              return r;
            };
          }
          if (prop === 'iter') {
            return () => getTable(tableName);
          }
          if (prop === '_rows') {
            return () => getTable(tableName);
          }
          // Named indexes: by_owner, by_location, etc.
          if (prop.startsWith('by_')) {
            const column = INDEX_TO_COLUMN[prop];
            if (column) return indexFor(tableName, column);
            // Fallback: by_X -> try X + 'Id' pattern
            const guessCol = prop.slice(3) + 'Id';
            return indexFor(tableName, guessCol);
          }
          // Primary key accessors: .id, .identity, .scheduledId
          if (prop === 'id' || prop === 'identity' || prop === 'scheduledId') {
            return indexFor(tableName, prop);
          }
          // Unknown property -- return index for it
          return indexFor(tableName, prop);
        },
      });
    },
  });
}

export function createMockCtx(opts: {
  seed?: Record<string, any[]>;
  sender?: any;
  timestampMicros?: bigint;
} = {}) {
  return {
    db: createMockDb(opts.seed ?? {}),
    timestamp: { microsSinceUnixEpoch: opts.timestampMicros ?? 1_000_000_000_000n },
    sender: opts.sender ?? { toHexString: () => 'mock-identity-hex' },
  };
}
```

### Pattern 2: Testing Pure Functions (No Mock Needed)
**What:** Many combat/item functions are pure (no ctx dependency). Test them directly.
**When to use:** Functions like `applyArmorMitigation`, `applyVariance`, `rollQualityTier`, `calculateCritChance`, `abilityResourceCost`.

```typescript
import { describe, it, expect } from 'vitest';
import { applyArmorMitigation, applyVariance } from './combat_enemies';

describe('applyArmorMitigation', () => {
  it('reduces damage proportional to armor', () => {
    // Formula: damage * 100 / (100 + armor) * GLOBAL_DAMAGE_MULTIPLIER / 100
    const result = applyArmorMitigation(100n, 100n);
    // 100 * 100 / 200 = 50, then * 85 / 100 = 42
    expect(result).toBe(42n);
  });

  it('returns at least 1n for non-zero damage', () => {
    expect(applyArmorMitigation(1n, 10000n)).toBe(1n);
  });
});
```

### Pattern 3: Testing ctx-dependent Helpers
**What:** Functions that read/write `ctx.db` need mock context.
**When to use:** Functions like `getEquippedBonuses`, `addItemToInventory`, event logging functions.

```typescript
import { describe, it, expect } from 'vitest';
import { createMockCtx } from './test-utils';
import { getEquippedBonuses } from './items';

describe('getEquippedBonuses', () => {
  it('sums stats from equipped items', () => {
    const ctx = createMockCtx({
      seed: {
        item_instance: [
          { id: 1n, templateId: 10n, ownerCharacterId: 1n, equippedSlot: 'chest', quantity: 1n },
        ],
        item_template: [
          { id: 10n, strBonus: 5n, dexBonus: 3n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n,
            hpBonus: 10n, manaBonus: 0n, armorClassBonus: 4n, magicResistanceBonus: 0n },
        ],
        item_affix: [],
      },
    });
    const bonuses = getEquippedBonuses(ctx, 1n);
    expect(bonuses.str).toBe(5n);
    expect(bonuses.hpBonus).toBe(10n);
  });
});
```

### Anti-Patterns to Avoid
- **Testing reducers directly:** Reducers require `spacetimedb.reducer()` registration and dependency injection. Test the helper functions they call instead.
- **Mocking too many modules:** Only mock cross-module imports when necessary (e.g., `vi.mock('../helpers/events')` when testing combat helpers that call event logging). Test functions in isolation where possible.
- **Testing SpacetimeDB framework behavior:** Don't test that `insert` auto-increments IDs or that `filter` returns correct results -- those are mock behaviors, not application logic.
- **Duplicating mock DB code:** Always import from `test-utils.ts`. Never copy-paste the Proxy setup.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Mock DB | Per-test custom mock objects | Shared `createMockDb()` from `test-utils.ts` | Existing code already has 2 divergent implementations; unify them |
| Assertion helpers | Custom deep-equality checks | `expect().toBe()`, `expect().toEqual()`, `expect().toContain()` | Vitest built-in matchers cover all needs |
| Test data factories | Inline object literals everywhere | Helper functions like `makeCharacter()`, `makeItemTemplate()` in test-utils | Reduces boilerplate, makes tests readable |

## Common Pitfalls

### Pitfall 1: by_owner Index Column Name Mismatch
**What goes wrong:** The `by_owner` index maps to different columns depending on the table. `item_instance` uses `ownerCharacterId`, while other tables use `ownerId`.
**Why it happens:** SpacetimeDB table schemas are inconsistent in naming owner columns.
**How to avoid:** The mock DB's `INDEX_TO_COLUMN` map must handle table-specific overrides, or the mock must be flexible enough to try multiple column names. In the existing code, `item_instance.by_owner.filter(characterId)` filters on `ownerCharacterId`.
**Warning signs:** Tests return empty arrays when they should return seeded data.

### Pitfall 2: BigInt Comparison in Tests
**What goes wrong:** `expect(result).toBe(42)` fails when result is `42n` because `42 !== 42n`.
**Why it happens:** All game values are bigints but test authors may write number literals.
**How to avoid:** Always use bigint literals in assertions: `expect(result).toBe(42n)`.
**Warning signs:** Tests fail with "expected 42 to be 42" type messages.

### Pitfall 3: Module Import Side Effects
**What goes wrong:** Importing from files that import SpacetimeDB server modules (`spacetimedb/server`) causes errors because those modules expect a WASM runtime.
**Why it happens:** The schema and reducer files import from `spacetimedb/server` which isn't available in Node.
**How to avoid:** Use `vi.mock()` to mock SpacetimeDB imports. Test helpers that don't directly import schema definitions. The existing tests demonstrate this pattern -- `vi.mock('../helpers/location', ...)`.
**Warning signs:** `Cannot find module 'spacetimedb/server'` or similar import errors.

### Pitfall 4: Reducer Dependency Injection Pattern
**What goes wrong:** Trying to test reducer logic directly is difficult because reducers are registered via `registerXxxReducers(deps)` with many injected dependencies.
**Why it happens:** The codebase uses a dependency injection pattern where all reducers receive their deps as a single object.
**How to avoid:** Test the helper functions that reducers call, not the reducers themselves. For intent routing, test the command parsing/dispatch logic extracted from `submit_intent`.
**Warning signs:** Need to construct massive `deps` objects just to register a reducer for testing.

### Pitfall 5: Vitest Mock Hoisting
**What goes wrong:** `vi.mock()` calls must be at the top level of the file, before imports of the mocked module.
**Why it happens:** Vitest hoists `vi.mock()` calls but the factory function runs before other imports.
**How to avoid:** Place `vi.mock()` calls before the import of the module that depends on the mocked module. Use `vi.mock('path', () => ({ ... }))` with inline factory.
**Warning signs:** Mocks don't take effect, real modules get loaded.

## Code Examples

### Combat: Testing Pure Damage Formulas
```typescript
// helpers/combat_enemies.test.ts
import { describe, it, expect } from 'vitest';
import { applyArmorMitigation, applyVariance, scaleByPercent } from './combat_enemies';

describe('applyArmorMitigation', () => {
  it('applies armor reduction formula: damage * 100 / (100 + armor) * 85%', () => {
    // 100 damage, 100 armor -> 50 after armor, 42 after global 85% multiplier
    expect(applyArmorMitigation(100n, 100n)).toBe(42n);
  });

  it('floors at 1n to avoid zero-damage', () => {
    expect(applyArmorMitigation(1n, 99999n)).toBe(1n);
  });
});

describe('applyVariance', () => {
  it('returns value in [85%, 115%] range', () => {
    for (let seed = 0n; seed < 31n; seed++) {
      const result = applyVariance(100n, seed);
      expect(result).toBeGreaterThanOrEqual(85n);
      expect(result).toBeLessThanOrEqual(115n);
    }
  });

  it('returns at least 1n for positive values', () => {
    expect(applyVariance(1n, 0n)).toBeGreaterThanOrEqual(1n);
  });
});
```

### Combat Scaling: Testing Crit and Healing Formulas
```typescript
// data/combat_scaling.test.ts
import { describe, it, expect } from 'vitest';
import {
  calculateCritChance, getCritMultiplier, calculateHealingPower,
  applyMagicResistMitigation, calculateStatScaledAutoAttack,
} from './combat_scaling';

describe('calculateCritChance', () => {
  it('returns base 50 (5%) for 0 DEX', () => {
    expect(calculateCritChance(0n)).toBe(50n);
  });

  it('caps at 500 (50%)', () => {
    expect(calculateCritChance(10000n)).toBe(500n);
  });
});
```

### Items: Testing Inventory Operations with Mock DB
```typescript
// helpers/items.test.ts
import { describe, it, expect } from 'vitest';
import { createMockCtx } from './test-utils';

// Mock spacetimedb/server since items.ts imports SenderError
vi.mock('spacetimedb/server', () => ({
  SenderError: class SenderError extends Error { constructor(msg: string) { super(msg); } },
}));

import { addItemToInventory, removeItemFromInventory, getEquippedBonuses } from './items';

describe('addItemToInventory', () => {
  it('inserts new item instance for non-stackable', () => {
    const ctx = createMockCtx({
      seed: {
        item_template: [{ id: 1n, stackable: false, name: 'Sword' }],
        item_instance: [],
      },
    });
    addItemToInventory(ctx, 10n, 1n, 1n);
    const items = ctx.db.item_instance._rows();
    expect(items.length).toBe(1);
    expect(items[0].ownerCharacterId).toBe(10n);
  });

  it('stacks quantity for stackable items', () => {
    const ctx = createMockCtx({
      seed: {
        item_template: [{ id: 1n, stackable: true, name: 'Herb' }],
        item_instance: [{ id: 1n, templateId: 1n, ownerCharacterId: 10n, equippedSlot: undefined, quantity: 3n }],
      },
    });
    addItemToInventory(ctx, 10n, 1n, 5n);
    const items = ctx.db.item_instance._rows();
    expect(items.length).toBe(1);
    expect(items[0].quantity).toBe(8n);
  });
});
```

### Equipment Generation: Testing Pure Rarity/Affix Functions
```typescript
// helpers/items-gen.test.ts (co-located with items.ts)
import { describe, it, expect } from 'vitest';
import { rollQualityTier, rollQualityForDrop, generateAffixData, buildDisplayName, getWorldTier } from './items';

describe('getWorldTier', () => {
  it('maps level ranges to tiers', () => {
    expect(getWorldTier(1n)).toBe(1);
    expect(getWorldTier(10n)).toBe(1);
    expect(getWorldTier(11n)).toBe(2);
    expect(getWorldTier(50n)).toBe(5);
  });
});

describe('rollQualityTier', () => {
  it('returns valid rarity string', () => {
    const valid = ['common', 'uncommon', 'rare', 'epic'];
    const result = rollQualityTier(5n, 42n, 100n);
    expect(valid).toContain(result);
  });
});

describe('buildDisplayName', () => {
  it('combines prefix + base + suffix', () => {
    const name = buildDisplayName('Sword', [
      { affixType: 'prefix', affixName: 'Keen' },
      { affixType: 'suffix', affixName: 'of Flame' },
    ]);
    expect(name).toBe('Keen Sword of Flame');
  });
});
```

### Event Logging: Testing Insert Calls
```typescript
// helpers/events.test.ts
import { describe, it, expect } from 'vitest';
import { createMockCtx } from './test-utils';

vi.mock('./group', () => ({
  effectiveGroupId: () => null,
}));

import { appendPrivateEvent, appendWorldEvent, appendLocationEvent, fail } from './events';

describe('appendPrivateEvent', () => {
  it('inserts row into event_private table', () => {
    const ctx = createMockCtx();
    appendPrivateEvent(ctx, 1n, 2n, 'combat', 'You hit the wolf for 10 damage.');
    const rows = ctx.db.event_private._rows();
    expect(rows.length).toBe(1);
    expect(rows[0].kind).toBe('combat');
    expect(rows[0].characterId).toBe(1n);
  });
});

describe('fail', () => {
  it('emits system event to character', () => {
    const ctx = createMockCtx();
    fail(ctx, { id: 1n, ownerUserId: 2n }, 'Invalid action');
    const rows = ctx.db.event_private._rows();
    expect(rows[0].kind).toBe('system');
  });
});
```

### Intent Routing: Testing Command Dispatch
```typescript
// reducers/intent-routing.test.ts
import { describe, it, expect, vi } from 'vitest';

// The intent reducer is registered via registerIntentReducers(deps).
// To test routing, we test the regex patterns and dispatch logic.
// Extract the command-matching logic or test via the registered reducer with mock deps.

describe('intent routing patterns', () => {
  it('matches look with target', () => {
    const match = 'look goblin'.match(/^(?:look|l)(?:\s+(.+))?$/i);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('goblin');
  });

  it('matches bare look', () => {
    const match = 'look'.match(/^(?:look|l)(?:\s+(.+))?$/i);
    expect(match).not.toBeNull();
    expect(match![1]).toBeUndefined();
  });

  it('matches go command', () => {
    const match = 'go Dark Forest'.match(/^go\s+(.+)$/i);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('Dark Forest');
  });

  it('matches help aliases', () => {
    for (const cmd of ['help', 'h', '?']) {
      const lower = cmd.toLowerCase();
      expect(lower === 'help' || lower === 'h' || lower === '?').toBe(true);
    }
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Copy-paste mock DB per test file | Shared `createMockDb()` utility | This phase | Eliminates divergence between 2+ mock implementations |
| No combat tests | Regression tests on formula helpers | This phase | Catches balance regressions from constant changes |
| Manual testing of commands | Automated intent routing tests | This phase | Verifies all command aliases parse correctly |

## Open Questions

1. **Intent routing testability**
   - What we know: The intent reducer uses inline regex matching and string comparisons within a single large function. Commands aren't dispatched through a command registry.
   - What's unclear: Whether to test by extracting regex patterns, or by calling the reducer with full mock deps.
   - Recommendation: Test regex patterns directly for command parsing. For dispatch behavior, create a lightweight test that exercises the registered reducer with minimal mock deps -- or accept that intent routing tests verify the patterns but not the full dispatch.

2. **Mock DB index accuracy for `by_owner`**
   - What we know: `item_instance.by_owner.filter(characterId)` filters on `ownerCharacterId` (not `ownerId`). Other tables use `ownerId`. The `item_affix` table uses `by_instance` (mapping to `instanceId`).
   - What's unclear: Complete mapping of all index names to column names across all tables.
   - Recommendation: Build the `INDEX_TO_COLUMN` map from the actual table schemas. For edge cases, the Proxy can fall back to trying `prop.slice(3) + 'Id'` as a column name guess. Add table-specific overrides where needed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 (declared ^3.2.1) |
| Config file | No vitest.config.ts -- uses defaults with tsconfig.json |
| Quick run command | `cd spacetimedb && npm test` |
| Full suite command | `cd spacetimedb && npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-01 | Unified mock DB utility | unit | `npx vitest run helpers/test-utils.test.ts` | No -- Wave 0 |
| TEST-02 | Combat regression tests | unit | `npx vitest run helpers/combat.test.ts helpers/combat_enemies.test.ts` | No -- Wave 0 |
| TEST-03 | Item/inventory tests | unit | `npx vitest run helpers/items.test.ts` | No -- Wave 0 |
| TEST-04 | Intent routing tests | unit | `npx vitest run reducers/intent.test.ts` | Partial -- exists but only tests `buildLookOutput` |
| TEST-05 | Equipment generation tests | unit | `npx vitest run helpers/items.test.ts` (same file, equipment gen section) | No -- Wave 0 |
| TEST-06 | Event logging tests | unit | `npx vitest run helpers/events.test.ts` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd spacetimedb && npx vitest run`
- **Per wave merge:** `cd spacetimedb && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `helpers/test-utils.ts` -- shared mock DB utility (TEST-01)
- [ ] `helpers/combat.test.ts` -- combat regression tests (TEST-02)
- [ ] `helpers/combat_enemies.test.ts` -- armor/variance tests (TEST-02)
- [ ] `helpers/items.test.ts` -- inventory + equipment gen tests (TEST-03, TEST-05)
- [ ] `helpers/events.test.ts` -- event logging tests (TEST-06)
- [ ] Refactor `helpers/world_gen.test.ts` to import from `test-utils.ts`
- [ ] Refactor/expand `reducers/intent.test.ts` to use shared mock + add routing tests (TEST-04)

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `spacetimedb/src/helpers/world_gen.test.ts` -- existing mock DB pattern
- Codebase analysis: `spacetimedb/src/reducers/intent.test.ts` -- existing mock DB pattern with pre-seeding
- Codebase analysis: `spacetimedb/package.json` -- vitest ^3.2.1 configured
- Codebase analysis: `spacetimedb/src/helpers/combat.ts` -- 30+ exported functions, key test targets identified
- Codebase analysis: `spacetimedb/src/helpers/items.ts` -- inventory helpers and equipment generation functions
- Codebase analysis: `spacetimedb/src/helpers/events.ts` -- all event emit functions
- Codebase analysis: `spacetimedb/src/reducers/intent.ts` -- command dispatch with regex patterns
- Codebase analysis: `spacetimedb/src/data/combat_scaling.ts` -- pure formula functions

### Secondary (MEDIUM confidence)
- Vitest documentation (training data) -- describe/it/expect API, vi.mock behavior

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Vitest already configured and working in project
- Architecture: HIGH -- Two working test files provide proven patterns to generalize
- Pitfalls: HIGH -- Identified from actual codebase analysis (column naming, bigint types, import chains)

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable -- testing infrastructure, no external dependencies moving fast)
