# Phase 39: Procedure-to-Claude Spike - Pattern Map

**Mapped:** 2026-09-29
**Files analyzed:** 11 (new/modified)
**Analogs found:** 8 / 11 (3 have no in-repo analog: procedures, Node harness, Vitest live config)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `spacetimedb/src/spike/spike_tables.ts` (temp) | model (tables) | CRUD + scheduled | `spacetimedb/src/schema/tables.ts` (`CombatLoopTick` 1217-1227, `LlmConfig` 1890-1897) | role-match (use `onSchedule`, not `scheduled:`) |
| `spacetimedb/src/spike/llm_spike.ts` (temp) `registerSpike()` | service/reducers + procedures | event-driven (scheduled) + request-response | `spacetimedb/src/reducers/llm.ts` (`registerLlmReducers`), `combat.ts:2714` (scheduled reducer) | role-match; no procedure exists in repo |
| `spike_set_key` reducer (in llm_spike.ts) | reducer (gated) | CRUD | `reducers/llm.ts` `set_api_key` (lines 7-19) | exact (swap `requireAdmin` for CLI identity check) |
| `spike_tick_probe` reducer | reducer (scheduled, self-rescheduling) | event-driven | `combat.ts:2714` `combat_loop`; `index.ts` `tick_day_night` | exact |
| `spacetimedb/src/schema/tables.ts` (TEMP diff) | config (schema) | n/a | itself, `schema({...})` at line 2129 | exact |
| `spacetimedb/src/index.ts` (TEMP diff) | config (registration) | n/a | itself, lines 253-283, 1828 | exact |
| `spacetimedb/src/helpers/measurement.ts` (KEPT) | utility (pure) | transform | `spacetimedb/src/helpers/skill_budget.ts` | role-match |
| `spacetimedb/src/helpers/measurement.test.ts` (KEPT) | test | transform | `helpers/skill_gen.test.ts` | exact |
| `scripts/spike/harness.ts`, `rungs.live.ts`, `vitest.spike.config.ts` (temp) | test/tooling | streaming (WS) | none (no `scripts/` dir; `vite.config.ts` is the only config) | no analog |
| `scripts/spike/set-key.mjs`, `hop-baseline.mjs` (temp) | utility/CLI | file-I/O + request-response | `llm-proxy/scripts/smoke.sh` (`.dev.vars` parsing, PROXY_URL) | partial (bash, not Node) |
| `39-SPIKE-RECORD.md`, `39-spike-results.json` | docs | n/a | none | n/a |

## Pattern Assignments

### `spike/spike_tables.ts` (model, scheduled CRUD)

**Analog:** `spacetimedb/src/schema/tables.ts`

Schedule table (lines 1217-1227). Note the repo uses the deprecated `scheduled:` closure. RESEARCH says use `onSchedule` on the procedure/reducer instead, so the spike table has NO `scheduled:` option:
```typescript
export const CombatLoopTick = table(
  {
    name: 'combat_loop_tick',
    scheduled: () => scheduledReducers['combat_loop'],
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    combatId: t.u64(),
  }
);
```
Private singleton table (lines 1890-1897), the shape of `spike_state` and the table `spike_set_key` writes:
```typescript
export const LlmConfig = table(
  { name: 'llm_config' },
  {
    id: t.u64().primaryKey(),  // Always 1 (singleton pattern)
    apiKey: t.string(),
    updatedAt: t.timestamp(),
  }
);
```
Rules: import `table, t` from `'spacetimedb/server'`; do NOT import `schema/tables.ts` (avoids circularity); private by default, `public: true` only for `spike_result` and `spike_tick_sample`.

---

### `spike/llm_spike.ts` (`registerSpike(spacetimedb)`)

**Analog (structure):** `spacetimedb/src/reducers/llm.ts` lines 1-6: exported `registerXReducers(deps)` function, reducers registered with the 3-arg form `spacetimedb.reducer('name', { params }, (ctx: any, {..}) => {})`, `ctx: any` typing.

**Analog (self-rescheduling scheduled reducer):** `spacetimedb/src/reducers/combat.ts:2714` and `combat.ts:1586`:
```typescript
scheduledReducers['combat_loop'] = spacetimedb.reducer('combat_loop', { arg: CombatLoopTick.rowType }, (ctx, { arg }) => {
  const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
  ...
ctx.db.health_regen_tick.insert({
  scheduledId: 0n,
  scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + REGEN_TICK_MICROS),
```
Imports for the tick: `import { ScheduleAt } from 'spacetimedb';` (index.ts line 3) and `COMBAT_LOOP_INTERVAL_MICROS` from `'../data/combat_constants'` (line 5 of that file, `1_000_000n`). For the spike, register with `{ name: 'spike_tick_probe', onSchedule: SpikeTick }` (object-name form; `_wrapMethod` supports it).

**Procedure registration (NO analog in repo; grep found no `procedure(` call outside the `_wrapMethod` comment).** Copy from RESEARCH.md Code Example 2. It MUST use the 4-arg form so `_wrapMethod` exports it by name:
```typescript
spacetimedb.procedure({ name: 'spike_run_job', onSchedule: SpikeJob }, { arg: SpikeJob.rowType }, t.unit(), (ctx, { arg }) => { ...; return {}; });
```
`ctx.http.fetch` outside `withTx`; `TimeDuration` from `'spacetimedb'`, not `'spacetimedb/server'`.

**Key reducer analog:** `reducers/llm.ts` lines 7-19 (copy body, replace gate):
```typescript
spacetimedb.reducer('set_api_key', { apiKey: t.string() }, (ctx: any, { apiKey }: { apiKey: string }) => {
  requireAdmin(ctx);
  if (!apiKey || apiKey.trim().length === 0) {
    throw new SenderError('API key cannot be empty');
  }
  const existing = ctx.db.llm_config.id.find(1n);
  if (existing) {
    ctx.db.llm_config.id.update({ ...existing, apiKey: apiKey.trim(), updatedAt: ctx.timestamp });
  } else {
    ctx.db.llm_config.insert({ id: 1n, apiKey: apiKey.trim(), updatedAt: ctx.timestamp });
  }
});
```
Replace `requireAdmin(ctx)` with `ctx.sender.toHexString() !== CLI_IDENTITY` check (do NOT modify `data/admin.ts`). Use `SenderError` (no character context; memory rule allows it for low-level helpers). Table accessors use snake_case schema keys (`ctx.db.llm_config`, `tx.db.spike_state`).

---

### `schema/tables.ts` TEMP diff (schema registration)

**Analog:** itself. `schema({...})` at line 2129 lists `snake_case_key: TableConst,` entries, ending with `round_timer_tick: RoundTimerTick,` then `});` and `export default spacetimedb; export { spacetimedb };`. Add one import from `'../spike/spike_tables'` and five entries (`spike_job`, `spike_tick`, `spike_result`, `spike_tick_sample`, `spike_state`) before `});`. A `onSchedule` table handle must appear exactly once in `schema({})`. Reverted at phase end (`git diff <start-sha>` must be empty).

---

### `index.ts` TEMP diff (reducer registration)

**Analog:** itself.

Monkey-patch (lines 253-283):
```typescript
const _wrapMethod = (methodName: string, nameExtractor: (args: any[]) => string | undefined) => { ... _moduleExports[exportName] = result; ... };
_wrapMethod('reducer', (args) => typeof args[0] === 'string' ? args[0] : args[0]?.name);
_wrapMethod('procedure', (args) => {
  if (args.length >= 4 && typeof args[0]?.name === 'string') return args[0].name;
  return undefined;
});
```
Registration site (lines 1828-1831):
```typescript
registerReducers(reducerDeps);

// V2: Export all collected reducers, lifecycle hooks, and views
export const _stdb_exports = spacetimedb.exportGroup(_moduleExports);
```
Insert `registerSpike(spacetimedb);` between them (must run AFTER `_wrapMethod` patches, so a side-effect import would be too early). Add `import { registerSpike } from './spike/llm_spike';` with the other imports.

---

### `helpers/measurement.ts` (utility, pure, KEPT)

**Analog:** `spacetimedb/src/helpers/skill_budget.ts` (pure exported functions and `const` tables, banner comment, imports only from `../data/*`, no ctx/db):
```typescript
// ============================================================================
// SKILL BUDGET — Power validation and clamping for generated abilities
// ============================================================================
import { ABILITY_KINDS, ... } from '../data/mechanical_vocabulary';
export const BASE_BUDGET: Record<string, {...}> = {...};
```
Exports: `percentile` (nearest-rank), `summarize`, `evaluateGate` (returns go / go-with-cap / no-go / incomplete). File name and content must not contain "spike" (kept files stay free of the word; the 39-10 cleanup gate greps `spacetimedb/src` with a case-sensitive spike-module identifier pattern, not the bare word, because `data/combat_scaling.ts` already contains the unrelated `summoner_conjured_spike` key).

### `helpers/measurement.test.ts` (test, KEPT)

**Analog:** `spacetimedb/src/helpers/skill_gen.test.ts` lines 1-3 and 5-30: colocated, `import { describe, it, expect } from 'vitest'; import { fn } from './module';`, banner comment per describe, loop-generated `it(...)` cases. Pure functions need no `test-utils.ts`. `test-utils.ts` (`createMockDb(seed)`, Proxy-based mock of `ctx.db` with insert/find/filter/update/delete) is only needed if a reducer is unit-tested, which the plan does not require. Run with `pnpm --dir spacetimedb test` (`vitest run`, no vitest config file exists in `spacetimedb/`, defaults apply). Include boundary cases: p95 at n=50, `incomplete` on low sample counts, threshold equality (p95 == 2x baseline).

---

### `scripts/spike/*` (harness, runner, hop baseline)

**No in-repo analog for Node/TS harness or Vitest live config.** The repo has no `scripts/` directory, no root `vitest.config`, and only `vite.config.ts` (Vue plugin). Planner should use RESEARCH.md structure: `vitest.spike.config.ts` with `include: ['scripts/spike/**/*.live.ts']`, so `pnpm test` (root `vitest run`) never picks it up.

**Partial analog for key/env parsing and secret hygiene:** `llm-proxy/scripts/smoke.sh` lines 1-25 (bash): reads `PROXY_SECRET` from `.dev.vars` tolerating `export`, spaces, CRLF, quotes; env overrides `PROXY_URL` (default `http://127.0.0.1:8787`), `DEV_VARS`; exit codes 0/1/2; never echoes the secret. `hop-baseline.mjs` should mirror these defaults and the "secret missing -> exit 2" behavior, reimplemented in Node (`process.loadEnvFile`).

**Repo commands to reuse (root `package.json` lines 13-16):**
```
"spacetime:generate": "spacetime generate --lang typescript --out-dir src/module_bindings --module-path spacetimedb"
"spacetime:publish": "spacetime publish uwr --server local"   // NEVER use in this phase
```
Spike equivalents: `spacetime generate --lang typescript --out-dir scripts/spike/bindings -p spacetimedb --no-config`; `spacetime publish uwr-spike -p spacetimedb --server local --no-config`.

## Shared Patterns

### Private-by-default tables and snake_case accessors
**Source:** `schema/tables.ts` header comment "LLM Pipeline tables (all private — no public: true)" (line 1888). **Apply to:** all spike tables; only `spike_result` / `spike_tick_sample` are `public: true`.

### Scheduled table keying
**Source:** `CombatLoopTick` (1217-1227) plus user memory. Primary key is `scheduledId` (`ctx.db.x.scheduledId.delete(id)`), not `id`. Insert with `scheduledId: 0n`. **Apply to:** `spike_job`, `spike_tick`, `spike_state` (the latter is a plain table keyed `id`).

### Reducer error style
**Source:** `reducers/llm.ts` `throw new SenderError('...')` for validation where no character exists. **Apply to:** all spike reducers (no `fail()`; no character).

### Registration through `_wrapMethod`
**Source:** `index.ts` 253-283. Reducers: string name or `{ name, ... }`. Procedures: only the 4-arg form is exported by name.

### Isolation guard
**Apply to:** all scripts. Hard-code `SPIKE_DB = 'uwr-spike'`, refuse any other DB and any `maincloud` server (CLAUDE.md and memory: never auto-publish to maincloud; never `--clear-database` on `uwr`).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `spike_run_job` / `spike_direct_call` procedures | procedure | event-driven / HTTP | No `spacetimedb.procedure(` call exists in the repo. HTTP currently goes client -> `llm-proxy` Worker. Use RESEARCH.md Code Example 2 |
| `scripts/spike/harness.ts`, `rungs.live.ts`, `vitest.spike.config.ts` | test/tooling | streaming (WS) | No Node SDK client or `scripts/` dir exists |
| `set-key.mjs` | CLI | file-I/O | Only bash precedent (`smoke.sh`) |
| `39-SPIKE-RECORD.md`, `39-spike-results.json` | docs | n/a | New artifact types |

## Metadata

**Analog search scope:** `spacetimedb/src/{schema,reducers,helpers,data}`, `spacetimedb/src/index.ts`, root `package.json` and `vite.config.ts`, `llm-proxy/scripts`
**Files scanned:** about 15 (targeted Grep and Read)
**Pattern extraction date:** 2026-09-29
**Note:** RESEARCH.md was read to line 510 of 746 (Code Examples 1-4 and architecture were covered; the remainder of the file was not read).
