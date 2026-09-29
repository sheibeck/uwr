---
title: Platform upgrade research (SpacetimeDB 2.10, tooling, llm-proxy)
date: 2026-09-29
context: /gsd-explore session before Phase 38. Two research passes; no code changed.
---

# Platform Upgrade Research

Snapshot as of 2026-09-29. Local Node is v22.23.2.

## Version gap

| Package | Current | Latest | Target |
|---|---|---|---|
| spacetimedb (CLI + npm, root and `spacetimedb/`) | 2.0.1 | 2.10.1 | 2.10.x |
| vue | 3.5.13 | 3.5.43 | latest |
| vite | 6.4 | 8.3.1 | 8.x |
| @vitejs/plugin-vue | 5.2 | 6.0.9 | 6.x |
| typescript | ~5.6 | 7.0.2 | **~6.0.3 (NOT 7)** |
| vue-tsc | 2.2 | 3.3.11 | 3.x |
| vitest (root 4.0, `spacetimedb/` 3.2) | — | 5.0.2 | 5.x both |
| hono | 4.7 | 4.13 | latest 4.x |
| openai | 4.85 | 7.23 | 7.x |
| wrangler | 4.0 | 4.143 | latest 4.x |
| @cloudflare/workers-types | 4.x | 5.x | 5.x (unreviewed) |

## SpacetimeDB 2.0.1 -> 2.10.1

Breaking changes that touch this project:
- **Index definitions require `accessor` (2.0.4).** Already compliant (`schema/tables.ts` uses `accessor:`). CLAUDE.md still shows `name:`.
- **Generated client table handles are camelCase (2.7.0).** Snake_case names (~273 refs in `src/`) keep working as deprecated aliases. No code iterates handles by key.
- **Optional fields in generated types become `foo?:` (2.6.1).** 176 `.optional()` columns; no reducer call passes `undefined` explicitly.
- **TypeScript client:** confirmed reads became the default (2.1.0), v3 websocket (2.2.0), auto-reconnect on focus/online (2.7.1). **Since 2.10.0, an error on an established connection fires `onDisconnect`, not `onConnectError`.** Check stale-token handling in `main.ts`.
- **Scheduled functions run concurrently (2.10.1).** Overdue jobs no longer run in strict `scheduled_at` order. There are 16 scheduled tables; check for ordering assumptions.
- **CLI:** `publish --yes` accepts an optional value, but the plain flag is unchanged. `spacetime delete` now prompts.

Status of the old workarounds:
1. **`ctx.http.fetch` in procedures is probably fixed.** In 2.0.1 the default timeout was 500ms (10s max), so LLM calls timed out silently. Since 2.0.5 it is 30s default, 180s max ([#4630](https://github.com/clockworklabs/SpacetimeDB/pull/4630)). Loopback and private IPs are still blocked by design ([#4546](https://github.com/clockworklabs/SpacetimeDB/issues/4546)). `ctx.sender` was empty in procedures from 2.4 to 2.6.0 and fixed in 2.6.1. **Not yet tested locally.** See the spike todo.
2. **Multi-column index `.filter()` is fixed** (2.7.0 prefix scans, 2.8.0 range scans). The only composite index, `by_key`, is unused.
3. **Views still can't use `.iter()`.** Use index `find`/`filter`/`count()`, or query-builder views (`ctx.from.x.where(...)`).

New features worth considering: the Vue `useProcedure` composable, primary keys on views, `table.clear()`, adding unique or primary-key constraints without clearing, dropping empty tables in auto-migration, `onSchedule` across files, `spacetime logs --level`, `spacetime lock`, and `spacetime mcp`.

Upgrade steps:
1. `spacetime version upgrade`
2. Bump `spacetimedb` to `^2.10.1` in the root and in `spacetimedb/`
3. `pnpm spacetime:generate`
4. `spacetime publish uwr -p spacetimedb` (no `--clear-database`)
5. Run the tests

Unknown: whether a local database created under 2.0.1 loads cleanly on 2.10.1 (medium confidence). **Back up first.** Maincloud already runs the latest server.

## Tooling

- **TypeScript 7 blocker.** `typescript@7.0.2` has no compiler JS API, so vue-tsc cannot run on it ([vuejs/language-tools#5381](https://github.com/vuejs/language-tools/issues/5381)). A fix is expected in TS 7.1 (around October 2026). Pin `~6.0.3`. The TS 6 default changes (`types: []`, strict on, deprecated `baseUrl`/`moduleResolution: node`/es5) don't affect our three tsconfigs. `spacetime publish` bundles with its own toolchain.
- **vue-tsc 3 (medium risk).** Template checking may report new errors in `.vue` files. Plan one fix-up pass.
- **Vite 8 (low risk).** Moves to Rolldown/Oxc and Lightning CSS, and raises default browser targets (Chrome 111, Firefox 114, Safari 16.4). `vite.config.ts` uses only `vue()` and a string `define`, so no config change is needed.
- **plugin-vue 6 (low risk).** Only raises the Node floor and drops the CJS build.
- **Vitest 5 (low risk).** `vi.mock`/`vi.hoisted` must be top-level, and all 26 calls are. `clearMocks` now defaults to true. Unawaited async assertions fail. The `spacetimedb/` jump from 3 to 5 also crosses the v4 change to `vi.fn` arrow-function `new` behaviour; our 6 arrow implementations are never constructed.
- **openai 4 -> 7 (low risk).** v5 was the fetch rewrite, v6 changed Responses types, and v7 only raises the Node floor to 22. `llm-proxy/src/index.ts` uses only `chat.completions.create` and `usage.*_tokens`, which are unchanged.
- **wrangler / workers-types 5 (low-medium risk).** Consider bumping `compatibility_date`.
- **Node floor: 22.12** (from Vitest 5). Add `"engines": {"node": ">=22.12"}`.

## Package manager

- The project is **pnpm** (README uses `pnpm` for everything).
- **`pnpm-lock.yaml` is stale.** It was last updated on 2026-02-24. Since then, the root `package-lock.json` has been updated by npm in commits `9ca16301` (034-01) and `16a2a0f9` (HOJ). Regenerate the pnpm lockfile and delete the root `package-lock.json`.
- `spacetimedb/` and `llm-proxy/` have only `package-lock.json` and are not in a pnpm workspace (there is no `pnpm-workspace.yaml`). Decide during planning whether to convert them to pnpm or a workspace.

## Suggested order

1. SpacetimeDB (CLI, both packages, regenerate the bindings, publish locally, run the tests)
2. Vitest 5 in `spacetimedb/`
3. llm-proxy dependencies, then smoke-test with `wrangler dev`
4. Root: Vue patch, then TS ~6.0 and vue-tsc 3 (fix template errors), then Vite 8, plugin-vue 6 and Vitest 5
5. Lockfile cleanup, `engines`, and CLAUDE.md rule refresh

Build and test after each step.
