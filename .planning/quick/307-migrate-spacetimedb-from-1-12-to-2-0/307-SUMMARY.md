---
phase: quick-307
plan: 01
subsystem: infrastructure
tags: [spacetimedb, migration, v2, breaking-change]
dependency_graph:
  requires: []
  provides: [spacetimedb-v2-server, spacetimedb-v2-client]
  affects: [all-server-modules, all-client-subscriptions]
tech_stack:
  added: [spacetimedb-2.0.1]
  patterns: [schema-object-syntax, export-default-schema, withDatabaseName]
key_files:
  created: [pnpm-lock.yaml]
  modified:
    - spacetimedb/package.json
    - spacetimedb/package-lock.json
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/index.ts
    - package.json
    - src/main.ts
decisions:
  - Keep named export { spacetimedb } alongside export default for backward compatibility with reducer/view files
  - Accept v2 onConnect 3-arg signature but ignore token param (project uses SpacetimeAuth id_tokens)
  - Do NOT regenerate bindings (CLI v2.0 not installed; user action required)
metrics:
  duration: 396s
  completed: 2026-02-24T15:11:07Z
---

# Quick Task 307: Migrate SpacetimeDB from 1.12 to 2.0 Summary

Server and client dependencies updated to SpacetimeDB 2.0.1 with all breaking API changes applied: schema object syntax, export default, withDatabaseName connection builder, and v2 callback signatures.

## What Changed

### Task 1: Server-side migration
- **spacetimedb/package.json**: `"spacetimedb": "^1.12.0"` changed to `"spacetimedb": "^2.0.1"`
- **spacetimedb/src/schema/tables.ts**: `schema()` call changed from positional arguments to object syntax `schema({...})`, added `export default spacetimedb` and kept `export { spacetimedb }` for backward compatibility
- **spacetimedb/src/index.ts**: Re-export changed from `export { spacetimedb }` to `export { default, default as spacetimedb }` providing both the v2-required default export and the named export used by reducer/view files
- All 98 table `name:` properties preserved for SQL compatibility
- npm install succeeded, spacetimedb@2.0.1 installed

### Task 2: Client-side migration
- **package.json**: Client `"spacetimedb": "^1.12.0"` changed to `"spacetimedb": "^2.0.1"`
- **src/main.ts**: `.withModuleName(DB_NAME)` changed to `.withDatabaseName(DB_NAME)`
- **src/main.ts**: `onConnect` callback updated to v2 3-arg signature `(conn, identity, _token)`
- **src/main.ts**: `onDisconnect` callback updated to v2 signature `(_ctx, _err?)`
- pnpm install succeeded, spacetimedb@2.0.1 installed
- pnpm-lock.yaml created (first pnpm lockfile in project)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] Updated onConnect and onDisconnect callback signatures**
- **Found during:** Task 2
- **Issue:** SpacetimeDB v2 changed `onConnect` from `(conn, identity)` to `(conn, identity, token)` and `onDisconnect` from `()` to `(ctx, error?)`
- **Fix:** Updated both callbacks to match v2 signatures; token param ignored (project uses SpacetimeAuth id_tokens)
- **Files modified:** src/main.ts
- **Commit:** 6b189de

## Blockers

### SpacetimeDB CLI v2.0 Required

The local SpacetimeDB server and CLI are still v1.x. Both `spacetime publish` and `spacetime generate` fail with:

```
Error: Could not import "spacetime:sys@2.0", likely because this module was built for a newer version of SpacetimeDB.
It requires sys module v2.0, but that version is not supported by the database.
```

**User action required:**
1. Install SpacetimeDB CLI v2.0 (download from https://spacetimedb.com or `cargo install spacetimedb-cli`)
2. Start local SpacetimeDB v2.0 server: `spacetime start`
3. Publish module: `spacetime publish uwr --clear-database -y --project-path C:/projects/uwr/spacetimedb`
4. Regenerate bindings: `pnpm spacetime:generate` (or `spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb`)
5. Verify client builds: `pnpm build`

**Note:** `--clear-database` is required because the v1 to v2 schema format change is incompatible.

## Pre-existing Warnings

- Rolldown bundler warning: `"WorldDropItemDef" is not exported by item_defs.ts` - pre-existing, unrelated to migration

## Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Server-side migration | 9f2a902 | spacetimedb/package.json, spacetimedb/src/schema/tables.ts, spacetimedb/src/index.ts |
| 2 | Client-side migration | 6b189de | package.json, src/main.ts, pnpm-lock.yaml |

## Self-Check: PASSED

- All 6 modified/created files exist on disk
- Both commits (9f2a902, 6b189de) verified in git log
- spacetimedb/package.json contains "2.0.1"
- spacetimedb/src/schema/tables.ts contains "export default"
- src/main.ts contains "withDatabaseName"
- package.json (root) contains "2.0.1"
