# Phase 42: Client Cutover and Legacy Removal - Pattern Map

**Mapped:** 2026-09-30
**Files analyzed:** 22 new or modified (plus deletions inventory)
**Analogs found:** 20 / 22 (2 partial)

Note: 42-RESEARCH.md already carries the full deletion inventory and test-update table (Deletion Inventory, "Tests that reference the legacy names"); this file does not repeat them, it adds call-site confirmations and the copy-from excerpts. Line numbers verified 2026-09-30.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `spacetimedb/src/data/llm_indicator_lines.ts` | config (constants) | transform | `spacetimedb/src/data/llm_limits.ts`, `llm_routes.ts` (import-free constants) | role |
| `spacetimedb/src/data/llm_indicator_lines.test.ts` | test | transform | `spacetimedb/src/data/llm_routes.test.ts` | exact |
| `spacetimedb/src/schema/llm_absence.test.ts` | test | schema recorder | `spacetimedb/src/schema/llm_privacy.test.ts` + `helpers/schema_recorder.test.ts` | exact |
| `src/composables/useLlmStatus.ts` | hook (pure + thin computed) | request-response (view rows to UI) | `src/connectionLogging.ts` (pure helper style); `useCoreData.ts` (ref shape) | role |
| `src/composables/useLlmStatus.test.ts` | test | transform | `src/connectionLogging.test.ts`, `src/composables/useHotbar.test.ts` | role |
| `src/legacyCredentials.ts` (+ test) | utility | file-I/O (localStorage) | `src/connectionLogging.ts` (+ `.test.ts`) | role |
| `src/legacyLlmRemoval.test.ts` | test (static source guard) | file-I/O | `spacetimedb/src/data/pronoun_rules.test.ts` (fs scan) and `reducers/llm_cutover.test.ts:1724` | role |
| `scripts/check-bundle.mjs` (+ `.test.mjs`) | utility/CLI | batch file scan | `scripts/llm/proof_rules.mjs` (+ `.test.mjs`) and `scripts/llm/cli.mjs` | role |
| `spacetimedb/src/reducers/llm.ts` (purge_legacy_llm) | reducer | CRUD delete | same file, `purge_llm_tasks` lines 103-113 | exact |
| `spacetimedb/src/reducers/llm_admin.test.ts` | test | CRUD | same file lines 341-375 | exact |
| `src/App.vue`, `NarrativeConsole.vue`, `useCoreData.ts`, `main.ts` | edits | see below | self | - |
| `spacetimedb/src/index.ts`, `helpers/scheduling.ts`, `schema/tables.ts` | edits | see below | self | - |
| `README.md`, `.claude/skills/run-local/SKILL.md` | docs | - | self | - |

## Pattern Assignments

### `spacetimedb/src/data/llm_indicator_lines.ts` (constants, import-free)
**Analog:** `spacetimedb/src/data/llm_routes.ts` (exports `LLM_ROUTE_NAMES` at line 24, `LlmRoute` type at 34). Use the RESEARCH "Indicator data module" excerpt verbatim; no imports (client bundle must not pull schemas or the model id). Copy the lines from UI-SPEC Copywriting Contract. `pronoun_rules.test.ts` scans this directory automatically, so the Keeper is he/his and no "its/they".

### `spacetimedb/src/data/llm_indicator_lines.test.ts`
**Analog:** `spacetimedb/src/data/llm_routes.test.ts` (lines 1-30: vitest import, `LLM_ROUTE_NAMES` import, a `Record<LlmRoute,...>` literal that fails type-check when a route is added).
```typescript
import { describe, it, expect } from 'vitest';
import { LLM_ROUTE_NAMES } from './llm_routes';
import { KEEPER_BANNED_PHRASES } from './keeper_bible';   // exported at keeper_bible.ts:23
```
Assertions per RESEARCH: keys equal `LLM_ROUTE_NAMES` (sorted), non-null lines end `...`, no `!`, no banned phrases, priority equals non-silent routes in UI-SPEC order, fallback equals `creation_race` line. Also pin `LLM_ACTIVE_JOB_STATUSES` parity (`helpers/llm_queue.ts:44`) in the client test by reading the source, since the client must not import the queue helper.

### `spacetimedb/src/schema/llm_absence.test.ts`
**Analog:** `spacetimedb/src/schema/llm_privacy.test.ts`.
**Mock + recorder setup** (lines 1-10):
```typescript
import { describe, it, expect, vi } from 'vitest';
import { recordedTable, recordedTables } from '../helpers/schema_recorder';
vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);
```
**Core pattern** (lines 125-149): `await import('./tables'); recordedTables().filter(...)`; `const mod: any = await import('./tables'); mod.default.__defs` keys. For absence: `recordedTable('llm_task')` is undefined (same for `llm_request`, `llm_budget`, `llm_cleanup_tick`); `Object.keys(defs)` excludes them; reducer absence via `capturedReducer(name)` undefined after `import('../index')` or `registerLlmReducers` (see `llm_admin.test.ts:15-30` beforeAll). Do this ONLY in the publish-2 plan; in publish 1 the tables still exist. Guard against vacuity (`recordedTables().length > 10`), because `rows(ctx,'llm_task')` returns `[]` for unknown tables (Pitfall 6).
Also update in P2: `llm_privacy.test.ts:125-149` (public set `[]`, drop the `!== 'llm_task'` filter, `>= 12` guard).

### `src/composables/useLlmStatus.ts`
**Analog:** `src/connectionLogging.ts` (pure exported functions, no generated-context types, header comment explaining why) plus the RESEARCH "Pattern 1" excerpt. Rows come from `useCoreData`'s `llmJobs` shallowRef. Imports the data module with a relative path into `../../spacetimedb/src/data/llm_indicator_lines` (memory rule: client imports server constants from `spacetimedb/src/data/`). Compare `createdAt.microsSinceUnixEpoch` and `id` as bigint. Must NOT feed `NarrativeInput.disabled`.

### `src/composables/useLlmStatus.test.ts`
**Analog:** `src/connectionLogging.test.ts` (vitest, node env, no DOM; `import { describe, expect, it } from 'vitest'`). Test `selectLlmIndicator` (priority, tie-break oldest then lowest id, silent routes, unknown route fallback, terminal statuses inactive) and `resolveDisplayedLine` as plain functions. The composable wrapper can be tested with `ref([])` + `computed` in node. Component wiring is verified by static source guards (below), as the repo has no jsdom.

### `src/legacyCredentials.ts` (+ test)
**Analog:** `src/connectionLogging.ts` header/export style; code in RESEARCH "One-time credential cleanup". Literal must stay inside `removeItem('llm_proxy_secret')` (bundle-guard allowlist). Test uses a fake `{ removeItem: vi.fn() }`, a throwing fake, and node where `localStorage` is undefined.
**main.ts edit** (`src/main.ts` lines 1-8 imports, 20-ish `bootstrap`): add `import { clearLegacyLlmCredential } from './legacyCredentials';` next to `import { logConnectError, logDisconnect } from './connectionLogging';` (line 6) and call it at the top of `bootstrap` (line 21 region) before `createApp(...)` (line 36).

### `src/legacyLlmRemoval.test.ts` (static guards)
**Analog:** `spacetimedb/src/reducers/llm_cutover.test.ts:1724-1732` (readFileSync + regex over source) and `data/model_literals.test.ts:84-88` (REPO_ROOT via `fileURLToPath(new URL('../../../', import.meta.url))`, `SCAN_ROOTS`, `EXCLUDED_DIRS` incl. `module_bindings`). Assert: no file under `src/` (excluding `module_bindings`) names `llm_task`, `llm_request`, `useLlmProxy`, `VITE_LLM_PROXY`, `llm_proxy_secret` (except `legacyCredentials.ts` and its test); no dynamic `import.meta.env` whole-object use; `src/App.vue` has no `isLlmProxyProcessing`; `NarrativeConsole.vue` contains `role="status"` and the `prefers-reduced-motion` block; `llm-proxy/`, `client/` directories absent; `src/module_bindings` has no `submit_llm_result` or `llm_task` files (after P2 regenerate; for P1 only `submit_llm_result` and `validate_llm_request`).

### `scripts/check-bundle.mjs` (+ `scripts/check-bundle.test.mjs`)
**Analog:** `scripts/llm/proof_rules.mjs` (pure exported rules, frozen constants, JSDoc, no I/O) and `scripts/llm/proof_rules.test.mjs` (header comment `// Run from the repo root: pnpm exec vitest run --maxWorkers=1 scripts/llm/proof_rules.test.mjs`, `import { describe, expect, it } from 'vitest'`, `REPO_ROOT` from `./cli.mjs`). `scripts/llm/cli.mjs:20`: `export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');` (from `scripts/` use `'..'` once).
Export pure `auditBundle(files: Record<string,string>): string[]`; CLI entry guarded by `process.argv[1]` compare to `fileURLToPath(import.meta.url)` (no existing script uses an isMain guard; `set-key.mjs:23` just reads `process.argv.slice(2)`, so this guard is new). Print rule names and file paths only. Rules table: RESEARCH "Bundle Guard Specification". Tests feed synthetic file maps: clean bundle passes; one `removeItem("llm_proxy_secret")` (quote variants `"`, `'`, backtick) passes; `getItem`/`setItem`/second occurrence fails; `localhost:8787`, `sk-ant-x`, `workers.dev`, `PROXY_SECRET` fail; `task-...` does not trip `sk-`. Root vitest already runs `.test.mjs` under `scripts/llm/`, so the same include applies (`vite.config.ts` has no explicit include; `pnpm test` = `vitest run`).

### `purge_legacy_llm` reducer (publish 1 only) in `spacetimedb/src/reducers/llm.ts`
**Analog:** same file, `purge_llm_tasks` (lines 103-113), which it replaces:
```typescript
spacetimedb.reducer('purge_llm_tasks', {}, (ctx: any) => {
  requireAdmin(ctx);
  const ids: bigint[] = [];
  for (const row of ctx.db.llm_task.iter()) ids.push(row.id);
  for (const id of ids) ctx.db.llm_task.id.delete(id);
  console.log(`llm_task purge: ${ids.length} rows`);
});
```
Generalize per the RESEARCH "Purge reducer" code (loop over four tables; `scheduledId` for `llm_cleanup_tick`). Same file also removes `validate_llm_request` (115-168) and the `checkBudget` import at line 1.
**Test analog:** `reducers/llm_admin.test.ts:341-375` (`describe('purge_llm_tasks')`: `createMockCtx({ sender: stranger, seed })`, `reducer(name)(ctx, {})`, `rows(ctx, table)`, `output.lines`). Setup in lines 1-30 (recording mock, `registerLlmReducers({...})`, `requireAdmin` from `../data/admin`). Seed all four tables; assert non-admin throws `'Admin only'` and nothing deleted; log line `legacy llm purge: llm_task=3 ...` counts only; idempotent second call. Note the mock must accept `.scheduledId.delete` for the tick table (check `helpers/test-utils` strict mock before relying on it).

### `spacetimedb/src/index.ts` edits
- Line 6: drop `toApplyJob`/`applyLlmResult`/`applyLlmFailure` from the import if unused after removal.
- Line 30: `LlmCleanupTick` import (P2). Line 226: `ensureLlmCleanupScheduled` import (P1). Line 649: call in `clientConnected` (P1).
- Lines 334-357: `sweep_llm_errors`. P1: drain-only. Its current pattern is at 337 (`scheduledReducers['sweep_llm_errors'] = spacetimedb.reducer('sweep_llm_errors', { arg: LlmCleanupTick.rowType }, (ctx) => {...})`); replace the body with a no-op (no `llm_request` read, no re-insert). P2: delete it.
- Lines 587-608: `submit_llm_result` delete (P1). Nearby `requireAdmin` use is the admin pattern at `set_app_version` (line ~358).

### `spacetimedb/src/helpers/scheduling.ts`
Remove `ensureLlmCleanupScheduled` (lines 67-74) and its call in `initScheduledTables` (line 87). Keep `ensureLlmSweepScheduled` (line 88) untouched.

### `spacetimedb/src/schema/tables.ts` (P2)
Remove `LlmRequest`, `LlmBudget`, `LlmCleanupTick` (1936), `LlmTask` (2108-2126), entries `llm_cleanup_tick` (2380) and `llm_task` (2385) in `schema({...})`, and the stale comment near 2230. Remove the re-export at `schema/scheduled_tables.ts:16`.

### `src/composables/data/useCoreData.ts`
**Analog (self):** the `bankSlots` view wiring.
- Line 37 `const llmTasks = shallowRef<any[]>([]);` -> `const llmJobs = shallowRef<any[]>([]);`
- Line 70 `llmTasks.value = [...dbConn.db.llm_task.iter()];` -> `llmJobs.value = [...dbConn.db.my_llm_jobs.iter()];` (same shape as line 67 `my_bank_slots`).
- Line 113 `toSql(tables.llm_task),` -> `toSql(tables.my_llm_jobs),` (same shape as line 110).
- Line 154: `rebind(dbConn.db.llm_task, llmTasks, () => dbConn.db.llm_task.iter());` -> `rebind(dbConn.db.my_llm_jobs, llmJobs, () => dbConn.db.my_llm_jobs.iter());` (helper at 119-124 registers insert/update/delete; the view has no PK).
- Line 190 return `llmTasks` -> `llmJobs`.
Requires regenerated bindings containing `my_llm_jobs` (already present per RESEARCH, `src/module_bindings/my_llm_jobs_table.ts`).

### `src/App.vue`
- Line 465: delete `import { useLlmProxy } ...`; add `useLlmStatus` import.
- Line 562: destructure `llmJobs` instead of `llmTasks`.
- Lines 737-741: delete the `useLlmProxy({ connActive, llmTasks })` block; add `const { status: llmStatus } = useLlmStatus({ llmJobs });` plus
  `const isLlmInputLocked = computed(() => isCreationLlmProcessing.value || isWorldGenProcessing.value);` and `llmIndicatorLine = computed(() => resolveDisplayedLine(llmStatus.value.indicatorLine, isLlmInputLocked.value))`.
- Line 1152 `const isNarrativeLlmProcessing = isLlmProxyProcessing;` -> `= isLlmInputLocked` (guards at 1170 and 1244 keep `.value` usage, so they need no edit).
- Line 40 (creation console): `:is-llm-processing="isCreationLlmProcessing || isWorldGenProcessing || isLlmProxyProcessing"` -> `isLlmInputLocked`; line 64 (game console) `:is-llm-processing="isNarrativeLlmProcessing"` stays but now locks for creation and world-gen only. Add `:llm-indicator-line="llmIndicatorLine"` to both consoles.

### `src/components/NarrativeConsole.vue`
- Lines 92-94 indicator div: change `v-if="isLlmProcessing"` to `v-if="llmIndicatorLine"`, add `class="llm-indicator" role="status" aria-live="polite"`, text `{{ llmIndicatorLine }}`; keep `:style="consideringStyle"` (lines 306-311 unchanged).
- Add prop `llmIndicatorLine: string | null` (optional) next to the existing `isLlmProcessing` prop (script; props also used at 271 for the placeholder and 107 for `NarrativeInput :disabled`, both unchanged).
- Style block at 330-334 (non-scoped, after `@keyframes narrativePulse`): add
```css
@media (prefers-reduced-motion: reduce) {
  .llm-indicator { animation: none !important; }   /* inline style beats plain rule (Pitfall 5) */
}
```

### Other client edits
- `src/composables/useNpcConversation.ts:7-8,25`: comments only; rewrite to the executor flow.
- Delete: `src/composables/useLlmProxy.ts`, `src/composables/useLlm.ts` (no other importers than `App.vue:465` for the former).
- `spacetimedb/src/data/model_literals.test.ts:21-25` allowlist to `{\n};` (keep multi-line form), line 86 drop `'llm-proxy/src'`; update `reducers/llm_cutover.test.ts:1724-1732` to assert `keys` equals `[]`.

### Docs
- `README.md`: delete line 67 (`pnpm --dir llm-proxy install`) and section "### 6. Start the LLM proxy" (115-123); renumber "### 7" (125) to 6; add a pointer to `docs/runbooks/llm-key.md`.
- `.claude/skills/run-local/SKILL.md`: line 3 description (remove "llm-proxy (wrangler dev)"), table row 3 at line 17 (proxy), line 22 netstat port list (drop 8787), line 25 (`pnpm --dir llm-proxy install`), line 38 `.dev.vars` bullet, plus the intro "Three long-lived processes", "all four are up", Stopping (workerd/wrangler) and line 11 `--clear-database` wording per RESEARCH.

## Shared Patterns

### Admin-only reducer
**Source:** `spacetimedb/src/reducers/llm.ts:103-113` (`requireAdmin(ctx)` first line; injected via `registerLlmReducers({ spacetimedb, t, SenderError, requireAdmin, ... })`). Counts-only logging (never row content; `findSecretLeaks` in `helpers/measurement` is used in `llm_admin.test.ts`).

### Recording-mock test harness
**Source:** `spacetimedb/src/schema/llm_privacy.test.ts:1-10`, `reducers/llm_admin.test.ts:1-30`. All server tests use `vi.mock('spacetimedb/server', async () => (await import('../helpers/schema_recorder')).createRecordingServerMock())`; run with `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 <file>`.

### Pure function + static source guard for client components
**Source:** `src/connectionLogging.ts` + `.test.ts`; no jsdom in the repo. Component wiring verified via `readFileSync` regex guards as in `llm_cutover.test.ts:1724`.

### Pronoun rule
Every new player-facing string (indicator lines): Keeper he/his, NPCs he/she, player "you". `data/pronoun_rules.test.ts` enforces `KEEPER_IT_OR_THEY` automatically on production `.ts` and `.vue`.

### Scheduled table PK
`scheduledId` (not `id`) for `llm_cleanup_tick` deletes (project memory; see `helpers/scheduling.ts:67-75` inserts `scheduledId: 0n`).

## No Analog Found

| File | Role | Reason |
|---|---|---|
| `scripts/check-bundle.mjs` CLI entry guard | utility | No existing script uses a `process.argv[1]` main-guard; use `import.meta.url` compare. Pure part follows `proof_rules.mjs`. |
| `src/legacyLlmRemoval.test.ts` (root-level client test) | test | Only one root client test style exists (`connectionLogging.test.ts`); the fs-scan approach is borrowed from the server-side tests (`pronoun_rules.test.ts`, `model_literals.test.ts`). |

## Metadata

**Analog search scope:** `src/`, `spacetimedb/src/{data,helpers,reducers,schema}`, `scripts/`, `README.md`, `.claude/skills/run-local/`
**Files scanned:** about 30 (targeted reads plus `git grep` for call sites)
**Pattern extraction date:** 2026-09-30
