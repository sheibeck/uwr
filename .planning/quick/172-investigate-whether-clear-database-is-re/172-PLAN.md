---
phase: quick-172
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true

must_haves:
  truths:
    - "Clear answer on whether --clear-database is needed for new enemy additions"
  artifacts: []
  key_links: []
---

<objective>
INVESTIGATION COMPLETE - No code changes needed.

This plan documents the findings of the codebase investigation. The answer is definitive:
**--clear-database is NOT required when adding new enemies.** All enemy seeding already uses
proper upsert patterns. Executors have been running --clear-database unnecessarily.
</objective>

## Investigation Findings

### 1. Enemy Template Seeding (`ensureEnemyTemplatesAndRoles`)

File: `spacetimedb/src/seeding/ensure_enemies.ts` lines 393-408

The `addEnemyTemplate` helper uses a proper **find-or-insert + update** pattern:

```typescript
const addEnemyTemplate = (row: any) => {
  const existing = findEnemyTemplateByName(ctx, row.name);
  if (existing) {
    // UPDATE existing row with new data, preserving the original ID
    ctx.db.enemyTemplate.id.update({ ...existing, ...row, id: existing.id });
    return ctx.db.enemyTemplate.id.find(existing.id) ?? { ...existing, ...row, id: existing.id };
  }
  // INSERT only if not found by name
  return ctx.db.enemyTemplate.insert({ id: 0n, ...row });
};
```

**Verdict: SAFE.** New enemies get inserted. Existing enemies get updated. No duplicates. No crashes.

### 2. Enemy Role Template Seeding (`addRoleTemplate`)

Same file, lines 409-441. Uses find-by-template+roleKey, then update-or-insert:

```typescript
const existing = [...ctx.db.enemyRoleTemplate.by_template.filter(template.id)].find(
  (row) => row.roleKey === roleKey
);
if (existing) {
  ctx.db.enemyRoleTemplate.id.update({ ...existing, /* new values */ });
  return;
}
ctx.db.enemyRoleTemplate.insert({ id: 0n, /* new values */ });
```

**Verdict: SAFE.** Proper upsert pattern.

### 3. Enemy Abilities (`ensureEnemyAbilities`)

File: `spacetimedb/src/seeding/ensure_world.ts` lines 523-561. Uses `upsertEnemyAbility`:

```typescript
const existing = [...ctx.db.enemyAbility.by_template.filter(template.id)].find(
  (row) => row.abilityKey === abilityKey
);
if (existing) {
  ctx.db.enemyAbility.id.update({ ...existing, /* new values */ });
  return;
}
ctx.db.enemyAbility.insert({ id: 0n, /* new values */ });
```

**Verdict: SAFE.** Proper upsert pattern.

### 4. Location-Enemy Linking (`ensureLocationEnemyTemplates`)

Same file as enemies, lines 368-391. Checks existing set, skips if already linked:

```typescript
const existing = new Set<string>();
for (const row of ctx.db.locationEnemyTemplate.by_location.filter(location.id)) {
  existing.add(row.enemyTemplateId.toString());
}
// ... for each template:
if (existing.has(template.id.toString())) continue;  // skip if already linked
ctx.db.locationEnemyTemplate.insert({ /* new link */ });
```

**Verdict: SAFE.** New enemy templates automatically get linked to matching locations on next publish.

### 5. Loot Tables (`ensureLootTables`, `ensureMaterialLootEntries`)

Both use explicit upsert patterns (`addOrSyncTable`, `upsertLootEntry`) that find existing rows
by composite key and update-or-insert.

**Verdict: SAFE.**

### 6. Vendor Inventory (`ensureVendorInventory`)

Uses `upsertVendorItem` which finds by vendor+item, then update-or-insert.

**Verdict: SAFE.**

### 7. How Seeding Is Triggered

`syncAllContent()` is called in TWO places:
- `spacetimedb.init()` (runs on every `spacetime publish`) in `spacetimedb/src/index.ts:281`
- `/synccontent` admin chat command and `sync_all_content` reducer

This means **every publish automatically re-runs all seeding**, and because every seeding
function uses upsert patterns, a plain `spacetime publish` (without `--clear-database`) will:
- Insert any NEW enemy templates, roles, abilities, and location links
- Update any CHANGED values on existing rows
- Leave all player data (characters, inventories, progress) intact

## Conclusion

| Scenario | --clear-database needed? |
|----------|--------------------------|
| Adding new enemies | NO - upsert inserts new, skips existing |
| Changing enemy stats | NO - upsert updates existing rows |
| Adding new enemy abilities | NO - upsert handles it |
| Adding non-optional columns to tables | YES - SpacetimeDB 1.11 migration limitation |
| Renaming a table or removing columns | YES - schema migration required |

**Action items for executors:**
- STOP using `--clear-database` when only adding new content (enemies, items, recipes, etc.)
- ONLY use `--clear-database` when making schema changes that add non-optional columns
  (as documented in STATE.md decision #111)
- A plain `spacetime publish` is sufficient and preserves all player data

<execution_context>
No execution needed. This is a documentation-only plan.
</execution_context>

<context>
@spacetimedb/src/seeding/ensure_enemies.ts
@spacetimedb/src/seeding/ensure_world.ts
@spacetimedb/src/seeding/ensure_content.ts
@spacetimedb/src/index.ts
</context>

<tasks>
<!-- No tasks needed - investigation is complete and documented above -->
</tasks>

<verification>
Grep the codebase for any plain `.insert()` calls in seeding functions that lack
a preceding existence check — none found. Every seeding function uses find-then-insert
or find-then-update patterns.
</verification>

<success_criteria>
User has a definitive answer: --clear-database is NOT needed for new enemy additions.
All seeding uses upsert patterns. Document this in STATE.md if desired.
</success_criteria>
