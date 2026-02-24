# Quick Task 307: Migrate SpacetimeDB 1.12 → 2.0

## Status: MAJOR PROGRESS — module publishes, bindings regenerated, client needs fixing

## What's Done ✅

1. **Package bumps** — server + client both on `spacetimedb@^2.0.1`
2. **Schema export** — `schema({...})` object syntax + `export default`
3. **Client connection** — `withModuleName` → `withDatabaseName` in src/main.ts
4. **Scheduled tables** — `scheduledReducers` registry with lazy thunks (14 tables)
5. **V2 export collection** — monkey-patch in index.ts auto-collects all 113 reducers + lifecycle hooks + views, exports via `exportGroup`
6. **Index names** — `name:` → `accessor:` on all 112 index defs (v2 global uniqueness)
7. **Module publishes** — `spacetime publish uwr -p spacetimedb` works on local v2
8. **Bindings regenerated** — `spacetime generate` completed, v2 bindings in src/module_bindings/

## What's Left

### Client-side compilation fixes
The v2 bindings changed significantly:
- Many `*_type.ts` files deleted (types consolidated into `types.ts` and `types/reducers.ts`)
- Private tables excluded from codegen (aggro_entry, bank_slot, scheduled tick tables, etc.)
- Reducer type imports changed
- Need to run `pnpm build` and fix any client TypeScript errors from the binding changes

### Subscription API (may need changes)
- v2 uses typed query builders instead of SQL strings
- Check if `SpacetimeDBProvider` auto-subscribes or if explicit subscription code needs updating

### Fresh publish crash
- `--delete-data=always` fresh publish crashes (init reducer timeout during heavy seeding)
- Update publish works fine — this is a separate issue, not blocking migration

### CLI flag updates for CLAUDE.md
- `--project-path` → `-p`/`--module-path`
- `--clear-database` → `--delete-data=always`

## Key Commits
- 9f2a902: server-side migration (package, schema, export)
- 6b189de: client-side migration (package, withDatabaseName)
- 834d986: scheduled reducers, export collection, index accessors
- c40e770: regenerate v2 bindings, module publishes successfully
