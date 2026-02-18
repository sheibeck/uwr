# Quick Task 172 — Summary

**Task:** Investigate whether --clear-database is required when adding new enemies

## Result

`--clear-database` is **NOT required** when adding new enemies. All enemy seeding already uses proper upsert (find-or-insert + update) patterns. Executors were running `--clear-database` unnecessarily on tasks 170 and others, wiping player data for no reason.

## Evidence

Every seeding function in `spacetimedb/src/seeding/ensure_enemies.ts` follows safe upsert patterns:

| Function | Pattern |
|----------|---------|
| `ensureEnemyTemplatesAndRoles` | `findEnemyTemplateByName()` → update or insert |
| `addRoleTemplate` | filter by template+roleKey → update or insert |
| `ensureEnemyAbilities` | filter by template+abilityKey → update or insert |
| `ensureLocationEnemyTemplates` | build existing Set, skip if present, insert if new |

`syncAllContent()` in `ensure_content.ts` is called by `spacetimedb.init()` on every publish. Since every function it calls uses upsert patterns, a plain `spacetime publish` will:
- **Insert** new enemy templates, roles, abilities, and location links
- **Update** changed values on existing rows
- **Preserve** all player data (characters, inventories, progress)

## When --clear-database IS needed

Only for **schema changes that add non-optional columns** to existing tables (per STATE.md decision #111). Adding new data rows NEVER requires it.

## Action Items for Future Work

- Executors should use plain `spacetime publish <db-name> --project-path <module-path>` for content-only changes
- Only use `--clear-database` when the commit explicitly adds non-optional columns to existing tables
- This has been added to STATE.md Key Decisions as a locked rule
