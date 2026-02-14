# Phase 4: Config Table Architecture - Research

**Researched:** 2026-02-13
**Domain:** SpacetimeDB TypeScript SDK, database schema migration, game config tables
**Confidence:** HIGH

## Summary

Phase 4 aims to consolidate fragmented ability and armor configuration data from hardcoded TypeScript constants into proper SpacetimeDB database tables. This technical debt reduction will create a single source of truth for game balance data while enabling client-side access to ability metadata.

The current architecture splits ability configuration across three files: `ability_catalog.ts` (ABILITIES constant with ~80 player abilities), `combat_scaling.ts` (ABILITY_STAT_SCALING dictionary), and `index.ts` (legacyDescriptions with 80+ hardcoded descriptions). The `AbilityTemplate` table exists but only stores partial metadata (name, className, level, resource, cast/cooldown, kind, combatState, description) - missing critical fields like power, damageType, DoT/HoT/debuff parameters, and stat scaling.

SpacetimeDB 1.12.0 TypeScript SDK supports automatic schema migration via column addition (requires columns at end of table with default values). The existing seeding pattern in `ensureAbilityTemplates()` provides a proven approach for migrating constant data to tables during module initialization.

**Primary recommendation:** Extend `AbilityConfig` table with nullable optional columns for all ability metadata, migrate ABILITIES constant data via enhanced seeding function, then systematically remove hardcoded constants after verifying database-driven execution works.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| spacetimedb | 1.12.0 | TypeScript server SDK | Official SpacetimeDB module runtime for TypeScript backends |
| SpacetimeDB runtime | 1.11.x+ | Database server | Production-ready runtime with automatic migration support |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| N/A | - | No additional libraries needed | Schema migration is native to SpacetimeDB |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extending existing table | Create new versioned table | Versioning avoids breaking changes but adds complexity for this use case - not needed since we're adding optional columns |
| Public table | Private table + view | Views have unreliable reactivity (decision 36), public table simpler for read-only config data |
| JSON blob column | Typed columns | JSON flexible but loses type safety and query performance - typed columns preferred per SpacetimeDB design philosophy |

**Installation:**
```bash
# Already installed - no additional dependencies required
```

## Architecture Patterns

### Recommended Project Structure
```
spacetimedb/src/
├── data/                    # Config constants (to be migrated)
│   ├── ability_catalog.ts   # Source: ABILITIES constant (migrate → AbilityConfig table)
│   ├── combat_scaling.ts    # Source: ABILITY_STAT_SCALING (merge into AbilityConfig)
│   └── class_stats.ts       # Source: CLASS_ARMOR (optional: migrate → ArmorProficiency)
├── index.ts                 # Schema definitions + reducers
│   ├── AbilityConfig table  # Target: consolidated ability metadata
│   ├── ensureAbilityConfig  # Seeding function (enhanced from ensureAbilityTemplates)
│   └── executeAbility       # Reader: access AbilityConfig instead of ABILITIES constant
└── reducers/                # Reducer implementations
```

### Pattern 1: Schema Migration via Column Addition
**What:** Add new columns to existing table using SpacetimeDB automatic migration
**When to use:** Extending table schema without data loss or client breaking changes
**Example:**
```typescript
// BEFORE (existing AbilityTemplate)
const AbilityTemplate = table(
  { name: 'ability_template', public: true, indexes: [...] },
  {
    id: t.u64().primaryKey().autoInc(),
    key: t.string(),
    name: t.string(),
    className: t.string(),
    level: t.u64(),
    resource: t.string(),
    castSeconds: t.u64(),
    cooldownSeconds: t.u64(),
    kind: t.string(),
    combatState: t.string(),
    description: t.string(),
  }
);

// AFTER (add new columns at end with optional() for backward compatibility)
const AbilityConfig = table(
  { name: 'ability_template', public: true, indexes: [...] },
  {
    id: t.u64().primaryKey().autoInc(),
    key: t.string(),
    name: t.string(),
    className: t.string(),
    level: t.u64(),
    resource: t.string(),
    castSeconds: t.u64(),
    cooldownSeconds: t.u64(),
    kind: t.string(),
    combatState: t.string(),
    description: t.string(),
    // NEW COLUMNS - must be at end, must be optional
    power: t.u64().optional(),
    damageType: t.string().optional(),
    statScaling: t.string().optional(),  // 'str' | 'int' | 'wis' | 'hybrid' | 'none'
    dotPowerSplit: t.f64().optional(),
    dotDuration: t.u64().optional(),
    hotPowerSplit: t.f64().optional(),
    hotDuration: t.u64().optional(),
    debuffType: t.string().optional(),
    debuffMagnitude: t.i64().optional(),
    debuffDuration: t.u64().optional(),
    aoeTargets: t.string().optional(),
  }
);
```
**Source:** [SpacetimeDB Automatic Migrations](https://spacetimedb.com/docs/databases/automatic-migrations/)

### Pattern 2: Data Seeding from Constants
**What:** Populate database tables from TypeScript constants during module initialization
**When to use:** Initial data migration, ensuring consistent seed data across deployments
**Example:**
```typescript
// Existing pattern from ensureAbilityTemplates()
function ensureAbilityConfig(ctx: any) {
  // Deduplicate existing rows by key
  const seenByKey = new Map<string, any>();
  for (const row of ctx.db.abilityTemplate.iter()) {
    const existing = seenByKey.get(row.key);
    if (!existing) {
      seenByKey.set(row.key, row);
      continue;
    }
    // Keep oldest ID, delete duplicates
    const keep = existing.id <= row.id ? existing : row;
    const drop = keep === existing ? row : existing;
    ctx.db.abilityTemplate.id.delete(drop.id);
    seenByKey.set(row.key, keep);
  }

  // Upsert from ABILITIES constant
  for (const [key, ability] of Object.entries(ABILITIES)) {
    const existing = seenByKey.get(key);
    const data = {
      key,
      name: ability.name,
      className: ability.className,
      level: ability.level,
      resource: ability.resource,
      castSeconds: ability.castSeconds,
      cooldownSeconds: ability.cooldownSeconds,
      power: ability.power,  // NEW: from ABILITIES constant
      damageType: ability.damageType,  // NEW
      statScaling: ABILITY_STAT_SCALING[key] ?? 'none',  // NEW: merge from combat_scaling.ts
      dotPowerSplit: ability.dotPowerSplit,  // NEW: optional metadata
      dotDuration: ability.dotDuration,
      // ... other new fields
    };

    if (existing) {
      ctx.db.abilityTemplate.id.update({ ...existing, ...data });
    } else {
      ctx.db.abilityTemplate.insert({ id: 0n, ...data });
    }
  }
}
```
**Source:** Existing codebase pattern in `spacetimedb/src/index.ts:4332`

### Pattern 3: Public Table for Read-Only Config
**What:** Use public tables for configuration data that clients need to read but never modify
**When to use:** Game balance data, ability metadata, item templates - any static config
**Example:**
```typescript
const AbilityConfig = table(
  {
    name: 'ability_config',
    public: true,  // Clients can query and subscribe
    indexes: [
      { name: 'by_key', algorithm: 'btree', columns: ['key'] },
      { name: 'by_class', algorithm: 'btree', columns: ['className'] },
    ]
  },
  { /* columns */ }
);

// Client-side access (after regenerating bindings)
import { useTable } from 'spacetimedb/react';
import { tables } from './module_bindings';

function AbilityList({ className }: { className: string }) {
  const [abilities, isLoading] = useTable(tables.abilityConfig);

  // Client-side filtering (table is public, all rows visible)
  const classAbilities = abilities.filter(a => a.className === className);

  return classAbilities.map(ability => (
    <div key={ability.key}>
      <h3>{ability.name}</h3>
      <p>Power: {ability.power}, Cooldown: {ability.cooldownSeconds}s</p>
      <p>{ability.description}</p>
    </div>
  ));
}
```
**Source:** [SpacetimeDB Tables Documentation](https://spacetimedb.com/docs/tables/)

### Anti-Patterns to Avoid
- **Removing columns or changing types:** Automatic migration doesn't support this - requires manual incremental migration or --clear-database (data loss)
- **Adding columns in middle of table:** Must add at end only
- **Adding non-optional columns without defaults:** Migration will fail - all new columns must be optional or have defaults
- **Renaming tables:** Not supported by automatic migration - requires new table + data copy + old table deletion
- **Using multi-column indexes for filtering:** SpacetimeDB TypeScript SDK has broken multi-column index filtering (decision 18) - use single-column indexes only

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema migration | Custom migration scripts | SpacetimeDB automatic migration | Built-in support for adding columns, handles data preservation automatically |
| Data seeding | Manual SQL inserts | TypeScript seeding functions in module init | Type-safe, version-controlled, runs automatically on publish |
| Client data access | Custom API endpoints | Public tables + client subscriptions | Zero-latency reactive updates, automatic caching, type-safe bindings |
| Config validation | Runtime checks on every access | Schema constraints + one-time seeding validation | Performance (validate once vs. per-access), type safety at compile time |

**Key insight:** SpacetimeDB's reactive table subscriptions eliminate the need for custom config API endpoints. Public tables give clients direct database access with automatic cache invalidation, making custom REST/GraphQL endpoints redundant for read-only config data.

## Common Pitfalls

### Pitfall 1: Breaking Automatic Migration Rules
**What goes wrong:** Publishing fails with schema error when adding columns incorrectly
**Why it happens:** Automatic migration has strict constraints - columns must be at end, must be optional or have defaults
**How to avoid:**
- Always add new columns at the END of column definitions
- Use `.optional()` for nullable fields or provide default values
- Test migration with `spacetime publish` before production deployment
**Warning signs:**
- Error: "cannot add column without default value"
- Error: "cannot modify existing column"
- Publishing hangs or fails during schema validation

### Pitfall 2: Forgetting to Regenerate Client Bindings
**What goes wrong:** Client code can't access new table columns, TypeScript errors on missing properties
**Why it happens:** Schema changes on server don't automatically update client-side generated code
**How to avoid:**
- Always run `spacetime generate` after schema changes
- Include binding regeneration in deployment checklist
- Consider automating with `spacetime publish && spacetime generate` script
**Warning signs:**
- TypeScript errors about missing properties on table rows
- Client displays undefined for new fields
- IntelliSense doesn't show new columns

### Pitfall 3: Removing Constants Before Database Migration Complete
**What goes wrong:** Runtime errors when `executeAbility` tries to access deleted ABILITIES constant
**Why it happens:** Incomplete migration - database table exists but `executeAbility` still reads from constant
**How to avoid:**
- Migrate in phases: (1) add table + seeding, (2) update executeAbility to read table, (3) remove constants
- Keep constants as fallback during transition period
- Add logging to verify table data is complete before removing constants
**Warning signs:**
- "Unknown ability" errors after removing ABILITIES constant
- Ability execution works in old code path, fails in new
- Missing metadata fields causing combat calculations to fail

### Pitfall 4: Multi-Column Index Filtering
**What goes wrong:** Queries return empty results or panic when filtering multi-column indexes
**Why it happens:** SpacetimeDB TypeScript SDK 1.12.0 has known bug with multi-column index filtering (decision 18)
**How to avoid:**
- Use single-column indexes only
- If multi-field queries needed, filter on single index then manually filter results
- Example: `by_class.filter(className)` then JS filter for level
**Warning signs:**
- Empty results from index queries that should return data
- Runtime panics in reducer execution
- Queries work with `.iter()` but fail with index `.filter()`

### Pitfall 5: Optional Fields Without Null Checks
**What goes wrong:** Runtime errors accessing properties on undefined values
**Why it happens:** Optional fields return `undefined` if not set, TypeScript allows access without null checks
**How to avoid:**
```typescript
// BAD: No null check
const power = ability.power;  // might be undefined
const damage = (power * 5n) + statValue;  // TypeError if power undefined

// GOOD: Explicit null handling
const power = ability.power ?? 0n;  // default to 0n if undefined
const damage = power > 0n ? (power * 5n) + statValue : 0n;
```
**Warning signs:**
- TypeError: Cannot read property 'X' of undefined
- Unexpected NaN or null in combat calculations
- Abilities work for some classes but fail for others (partial data migration)

## Code Examples

Verified patterns from official sources and existing codebase:

### Table Definition with Optional Columns
```typescript
// Source: SpacetimeDB TypeScript Reference + existing AbilityTemplate pattern
import { schema, table, t } from 'spacetimedb/server';

const AbilityConfig = table(
  {
    name: 'ability_config',
    public: true,
    indexes: [
      { name: 'by_key', algorithm: 'btree', columns: ['key'] },
      { name: 'by_class', algorithm: 'btree', columns: ['className'] },
    ],
  },
  {
    // Existing columns (keep for backward compatibility)
    id: t.u64().primaryKey().autoInc(),
    key: t.string(),
    name: t.string(),
    className: t.string(),
    level: t.u64(),
    resource: t.string(),
    castSeconds: t.u64(),
    cooldownSeconds: t.u64(),
    kind: t.string(),
    combatState: t.string(),
    description: t.string(),

    // NEW: Core ability data (from ABILITIES constant)
    power: t.u64().optional(),
    damageType: t.string().optional(),  // 'physical' | 'magic' | 'none'

    // NEW: Stat scaling (from ABILITY_STAT_SCALING)
    statScaling: t.string().optional(),  // 'str' | 'dex' | 'int' | 'wis' | 'cha' | 'hybrid' | 'none'

    // NEW: DoT metadata
    dotPowerSplit: t.f64().optional(),   // 0-1 fraction
    dotDuration: t.u64().optional(),     // ticks

    // NEW: HoT metadata
    hotPowerSplit: t.f64().optional(),
    hotDuration: t.u64().optional(),

    // NEW: Debuff metadata
    debuffType: t.string().optional(),      // 'ac_bonus' | 'damage_down' | 'armor_down' | 'slow'
    debuffMagnitude: t.i64().optional(),    // can be negative
    debuffDuration: t.u64().optional(),     // ticks

    // NEW: AoE metadata
    aoeTargets: t.string().optional(),      // 'all_enemies' | 'all_allies' | 'all_party'
  }
);
```

### Seeding Function Pattern
```typescript
// Source: Existing ensureAbilityTemplates() function (index.ts:4332)
import { ABILITIES } from './data/ability_catalog.js';
import { ABILITY_STAT_SCALING } from './data/combat_scaling.js';

function ensureAbilityConfig(ctx: any) {
  // Deduplicate existing rows (keep oldest ID)
  const seenByKey = new Map<string, any>();
  for (const row of ctx.db.abilityConfig.iter()) {
    const existing = seenByKey.get(row.key);
    if (!existing) {
      seenByKey.set(row.key, row);
      continue;
    }
    const keep = existing.id <= row.id ? existing : row;
    const drop = keep === existing ? row : existing;
    ctx.db.abilityConfig.id.delete(drop.id);
    seenByKey.set(row.key, keep);
  }

  // Merge descriptions from legacy constant
  const legacyDescriptions: Record<string, string> = {
    // ... 80+ entries (keep during migration, remove after verification)
  };

  // Upsert from ABILITIES constant
  for (const [key, ability] of Object.entries(ABILITIES)) {
    const existing = seenByKey.get(key);
    const data = {
      key,
      name: ability.name,
      className: ability.className,
      level: ability.level,
      resource: ability.resource,
      castSeconds: ability.castSeconds,
      cooldownSeconds: ability.cooldownSeconds,
      kind: determineKind(key),
      combatState: determineCombatState(key),
      description: ability.description ?? legacyDescriptions[key] ?? ability.name,
      // NEW: Merge from ABILITIES constant
      power: ability.power,
      damageType: ability.damageType,
      // NEW: Merge from ABILITY_STAT_SCALING
      statScaling: ABILITY_STAT_SCALING[key] ?? 'none',
      // NEW: Optional metadata (only present for some abilities)
      dotPowerSplit: ability.dotPowerSplit,
      dotDuration: ability.dotDuration,
      hotPowerSplit: ability.hotPowerSplit,
      hotDuration: ability.hotDuration,
      debuffType: ability.debuffType,
      debuffMagnitude: ability.debuffMagnitude,
      debuffDuration: ability.debuffDuration,
      aoeTargets: ability.aoeTargets,
    };

    if (existing) {
      ctx.db.abilityConfig.id.update({ ...existing, ...data });
    } else {
      ctx.db.abilityConfig.insert({ id: 0n, ...data });
    }
  }
}

// Call from init reducer (like existing syncAllContent)
spacetimedb.reducer('init', {}, (ctx) => {
  ensureAbilityConfig(ctx);
  // ... other init tasks
});
```

### Reading from Database Instead of Constants
```typescript
// BEFORE: Reading from ABILITIES constant
function executeAbility(ctx: any, character: any, abilityKey: string) {
  const ability = ABILITIES[abilityKey];  // Hardcoded constant
  if (!ability) throw new SenderError('Unknown ability');

  const power = ability.power;
  const damageType = ability.damageType;
  const statScaling = ABILITY_STAT_SCALING[abilityKey];  // Second constant
  // ...
}

// AFTER: Reading from database
function executeAbility(ctx: any, character: any, abilityKey: string) {
  const ability = ctx.db.abilityConfig.by_key.find(abilityKey);
  if (!ability) throw new SenderError('Unknown ability');

  // Null checks for optional fields
  const power = ability.power ?? 0n;
  const damageType = ability.damageType ?? 'none';
  const statScaling = ability.statScaling ?? 'none';

  // Optional metadata access with defaults
  const dotPowerSplit = ability.dotPowerSplit ?? 0;
  const dotDuration = ability.dotDuration ?? 0n;
  // ...
}
```

### Optional: ArmorProficiency Config Table
```typescript
// Pattern for migrating CLASS_ARMOR constant (if desired)
const ArmorProficiency = table(
  {
    name: 'armor_proficiency',
    public: true,
    indexes: [
      { name: 'by_class', algorithm: 'btree', columns: ['className'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    className: t.string(),
    armorType: t.string(),  // 'cloth' | 'leather' | 'chain' | 'plate'
    allowed: t.bool(),      // true for allowed, false for restricted
  }
);

// Seeding from CLASS_ARMOR constant
function ensureArmorProficiency(ctx: any) {
  for (const [className, allowedTypes] of Object.entries(CLASS_ARMOR)) {
    for (const armorType of ARMOR_TYPES) {
      const key = `${className}_${armorType}`;
      const existing = [...ctx.db.armorProficiency.by_class.filter(className)]
        .find(row => row.armorType === armorType);

      const allowed = allowedTypes.includes(armorType);

      if (existing) {
        ctx.db.armorProficiency.id.update({ ...existing, allowed });
      } else {
        ctx.db.armorProficiency.insert({
          id: 0n,
          className,
          armorType,
          allowed,
        });
      }
    }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded constants in TS files | Database config tables | Best practice since relational DBs existed | Single source of truth, client-accessible data, eliminates code duplication |
| Manual data seeding via SQL | TypeScript seeding functions in module init | SpacetimeDB pattern since 1.0 | Type-safe seeding, version control, automatic on publish |
| Custom API for config data | Public tables with client subscriptions | SpacetimeDB core design philosophy | Zero-latency reactive updates, eliminates API endpoints |
| String-based column addition | `.optional()` type builder modifier | SpacetimeDB 1.6.0+ | Type-safe nullable columns, automatic default handling |

**Deprecated/outdated:**
- **Manual schema migration scripts:** Replaced by SpacetimeDB automatic migration (adding columns, indexes)
- **`@clockworklabs/spacetimedb-sdk` package:** Deprecated in favor of `spacetimedb` package (v1.4.0+)
- **Positional reducer arguments:** Deprecated in favor of object syntax (v1.6.0+)
- **Views for per-user data filtering:** Per-user tables pattern replaced by public tables with client filtering (project decision 36)

## Open Questions

1. **Should we migrate CLASS_ARMOR to ArmorProficiency table?**
   - What we know: CLASS_ARMOR is 15 classes × 4 armor types = 60 entries, simple boolean logic
   - What's unclear: Future plans for class/armor system complexity - if expanding (proficiency levels, armor penalties, etc.), table makes sense; if staying simple, constant is fine
   - Recommendation: Mark as optional in phase scope - migrate if time permits, but not blocking for ability config work

2. **How to handle enemy abilities (ENEMY_ABILITIES constant)?**
   - What we know: Enemy abilities have different schema (aiChance, aiWeight, targetRule, different kinds like 'dot', 'heal', 'aoe_damage')
   - What's unclear: Should enemy abilities share AbilityConfig table (with enemy-specific optional columns) or use separate EnemyAbilityConfig table?
   - Recommendation: Start with player abilities only (ABILITIES constant), defer enemy ability migration to avoid scope creep - enemy abilities work differently enough to warrant separate planning

3. **Should ability implementations (switch cases) also be data-driven?**
   - What we know: ~80 switch cases in executeAbility implement ability-specific logic (summonPet, applyDamage, addCharacterEffect)
   - What's unclear: Is the goal to make abilities 100% data-driven (no code per ability) or just extract configuration data?
   - Recommendation: Configuration-only for this phase - keep switch cases for complex logic (summoning, special effects), only extract metadata to database

## Sources

### Primary (HIGH confidence)
- [SpacetimeDB Automatic Migrations](https://spacetimedb.com/docs/databases/automatic-migrations/) - Schema migration constraints and column addition
- [SpacetimeDB Incremental Migrations](https://spacetimedb.com/docs/how-to/incremental-migrations/) - Migration patterns and best practices
- [SpacetimeDB TypeScript Reference](https://spacetimedb.com/docs/modules/typescript/) - TypeBuilder API, column types, table() signature
- [SpacetimeDB Tables Documentation](https://spacetimedb.com/docs/tables/) - Public/private tables, client access patterns
- Existing codebase (`spacetimedb/src/index.ts`) - ensureAbilityTemplates pattern, AbilityTemplate table schema

### Secondary (MEDIUM confidence)
- [Best practices for using Spanner as a gaming database](https://docs.cloud.google.com/spanner/docs/best-practices-gaming-database) - Game database performance patterns
- [Technical Game Design - Configs and balance](https://habr.com/en/articles/737534/) - Config table architecture patterns for game balance
- [MMO Games and Database Design](https://www.red-gate.com/blog/mmo-games-and-database-design) - MMO database schema patterns

### Tertiary (LOW confidence)
- [Relational Database Guidelines For MMOGs](https://www.gamedeveloper.com/programming/relational-database-guidelines-for-mmogs) - General MMOG database principles (older article, concepts still valid)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Using official SpacetimeDB SDK 1.12.0, documented APIs
- Architecture: HIGH - Patterns verified from official docs + existing codebase
- Pitfalls: HIGH - Multi-column index bug confirmed in codebase (decision 18), migration constraints from official docs
- Code examples: HIGH - Directly from SpacetimeDB docs + existing codebase patterns

**Research date:** 2026-02-13
**Valid until:** 2026-04-13 (60 days - SpacetimeDB TypeScript is in beta but stable API)
