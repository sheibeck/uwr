# Quick Task 307: Migrate SpacetimeDB 1.12 → 2.0

## Status: NEAR COMPLETE — 340→58 TS errors, mostly pre-existing

## What's Done

1. **Package bumps** — server + client both on `spacetimedb@^2.0.1`
2. **Schema export** — `schema({...})` object syntax + `export default`
3. **Client connection** — `withModuleName` → `withDatabaseName` in src/main.ts
4. **Scheduled tables** — `scheduledReducers` registry with lazy thunks (14 tables)
5. **V2 export collection** — monkey-patch in index.ts auto-collects all 113 reducers + lifecycle hooks + views
6. **Index names** — `name:` → `accessor:` on all 112 index defs (v2 global uniqueness)
7. **Module publishes** — `spacetime publish uwr -p spacetimedb` works on local v2
8. **Bindings regenerated** — `spacetime generate` completed, v2 bindings in src/module_bindings/
9. **Table name casing** — all `tables.camelCase` → `tables.PascalCase` in useGameData.ts
10. **Type compatibility shim** — `src/stdb-types.ts` re-exports v2 types with Row suffix aliases
11. **Import migration** — all 33+ composables/components updated to import types from stdb-types
12. **Readonly array fix** — useTable wrapper in useGameData strips readonly from v2 subscription data

## What's Left (minor)

### Remaining 58 TS errors breakdown
- **31 TS6133**: Unused variables — PRE-EXISTING, not migration-related
- **10 TS2339**: Property doesn't exist on EventTarget — PRE-EXISTING
- **6 TS18047**: Possibly null — PRE-EXISTING
- **5 TS2322**: Minor type mismatches (ComputedRef vs Ref in App.vue)
- **2 TS7006**: Implicit any — PRE-EXISTING
- **2 TS2345**: bigint vs number in RenownPanel.vue (v2 uses bigint)
- **1 TS2554**: useCommands.ts:388 — recomputeRacialAllReducer({}) expects 0 args in v2
- **1 TS6196**: Unused import — PRE-EXISTING

### v2-specific remaining fixes (5 items)
1. `useCommands.ts:388` — `recomputeRacialAllReducer({})` needs arg removed (v2 takes 0 args)
2. `RenownPanel.vue:212,215` — `entry.position` is bigint, getPositionColor/Ordinal expect number → add `Number()`
3. `RenownPanel.vue:459` — `p.rankEarned` doesn't exist on RenownPerkRow → should be `p.rank`
4. `App.vue:724` — ComputedRef vs Ref type mismatch for currentPlayer
5. `App.vue:1274` — ComputedRef<string> vs Ref<bigint|null> type mismatch

### CLI flag updates for CLAUDE.md
- `--project-path` → `-p`/`--module-path`
- `--clear-database` → `--delete-data=always`

## Key Commits
- 9f2a902: server-side migration (package, schema, export)
- 6b189de: client-side migration (package, withDatabaseName)
- 834d986: scheduled reducers, export collection, index accessors
- c40e770: regenerate v2 bindings, module publishes successfully
- 5ec861e: fix v2 client type imports and table casing (340→58 errors)
