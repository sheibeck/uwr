# Quick Task 307: Migrate SpacetimeDB 1.12 → 2.0

## Status: PAUSED — needs fresh context window

## Migration Guide Fetched
Source: https://spacetimedb.com/docs/upgrade/

## Breaking Changes Summary (from migration guide)

### 1. Table name → accessor
- `table({ name: "my_table" })` → `table({ })` with `schema({ myTable })`
- Can use `caseConversionPolicy: CaseConversionPolicy.None` to preserve existing names
- OR specify `Name = "OriginalName"` on each table

### 2. Schema export changes
- `export const spacetimedb = schema(Table1, Table2)` → `const spacetimedb = schema({ myTable }); export default spacetimedb;`

### 3. Client connection
- `withModuleName()` → `withDatabaseName()`

### 4. Reducer callbacks REMOVED
- `conn.reducers.onXxx()` no longer exists
- Replace with `_then()` for personal calls or event tables for cross-client

### 5. Event tables needed for cross-client notifications
- `table({ event: true }, { ... })` on server
- Explicit subscription on client

### 6. Subscription API
- Typed query builders: `subscribe([tables.myTable])` instead of SQL strings

### 7. Scheduled functions private by default
- Remove auth checks from scheduled reducers
- Create public wrappers if clients need to invoke

### 8. Removed APIs
- `withLightMode()` — remove
- `CallReducerFlags` / `setReducerFlags()` — remove
- `Event.UnknownTransaction` → `Event.Transaction`

### 9. Update methods restricted to primary keys
- `.update()` only on primary key indexes, not `.unique()` indexes

### 10. Private items excluded from codegen
- Use `spacetime generate --include-private` if needed

## Key Files to Modify
- `spacetimedb/package.json` — bump spacetimedb dependency to 2.0.0
- `spacetimedb/src/schema/tables.ts` — ALL table definitions (dozens)
- `spacetimedb/src/schema/scheduled_tables.ts` — scheduled table exports
- `spacetimedb/src/index.ts` — schema export, reducer registrations
- `src/config.ts` or connection setup — `withModuleName` → `withDatabaseName`
- Client code using `conn.reducers.onXxx()` — need event tables or _then()
- Client `package.json` — bump spacetimedb client dependency

## Recommended Approach
1. Update package.json dependencies (server + client)
2. Update schema/tables.ts — change table() calls, use accessor pattern
3. Update schema export to `export default` + object syntax
4. Update client connection (`withDatabaseName`)
5. Remove deprecated APIs (CallReducerFlags, withLightMode, etc.)
6. Handle reducer callback removal (check if we use onXxx callbacks)
7. Regenerate client bindings
8. Test publish locally
