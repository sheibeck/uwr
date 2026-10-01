# Phase 43: Latency Tuning, Staged Generation and Budget - Pattern Map

**Mapped:** 2026-09-30
**Files analyzed:** 22 (new + modified)
**Analogs found:** 22 / 22
Site inventories for staging, ceiling and stats live in 43-RESEARCH.md ("Pattern 1-5", "Wiring Checklist", "Code Examples"). This file only adds real-codebase analog excerpts. Paths below are relative to `C:\projects\uwr`; `S/` = `spacetimedb/src/`.

## File Classification

| File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `S/data/llm_tuning.ts` (+ `.test.ts`) | config (pure data) | transform | `S/data/llm_limits.ts` + `llm_limits.test.ts` | exact |
| `S/data/llm_measurements.json` | config (data) | file | none (JSON data); read from test via fs like `llm_indicator_lines.test.ts` | partial |
| `S/helpers/llm_stats.ts` (+ test) | utility (pure) | transform | `S/helpers/measurement.ts` (`percentile`) + `S/helpers/llm_admin_state.ts` (pure, duck-typed) | role-match |
| `scripts/llm/sweep_rules.mjs` (+ `sweep_rules.test.mjs`) | utility (pure) | transform | `scripts/llm/proof_rules.mjs` + `proof_rules.test.mjs` | exact |
| `scripts/llm/sweep_fixtures.mjs` | config (data) | file | `proof_rules.mjs` constants / `prove-live.live.ts` RACE_DESCRIPTION | partial |
| `scripts/llm/sweep.live.ts` | test (paid harness) | request-response | `scripts/llm/prove-live.live.ts` + `vitest.live.config.ts` + `cli.mjs` | exact |
| new stage-1 routes/schemas/layers (`llm_routes.ts`, `llm_schemas.ts`, `llm_layers.ts`) | config | request-response | existing rows in same files | exact |
| `/llm` command in `S/reducers/commands.ts` | reducer (admin cmd) | request-response | `/synccontent` and `/unlockrace` branches, same file | exact |
| `llm_set_enabled` / `llm_set_daily_ceiling` in `S/reducers/llm.ts` | reducer | CRUD | `set_api_key`, `grant_test_pending_level` | exact |
| `llm_admin_state` / `llm_spend` defaulted columns (`S/schema/tables.ts`) | model | CRUD | existing table defs | exact |
| `S/helpers/llm_budget.ts`, `llm_admin_state.ts` edits | service | CRUD | themselves | exact |
| `S/views/llm.ts` (`admin_llm_status`) | view | request-response | itself | exact |
| `S/data/llm_indicator_lines.ts` pools + `src/composables/useLlmStatus.ts` rotation | config + hook | event-driven | themselves | exact |
| `S/helpers/world_gen.ts` stage split | service | CRUD/event-driven | `startWorldGeneration` | exact |

## Pattern Assignments

### `S/data/llm_tuning.ts` (+ test)
**Analog:** `S/data/llm_limits.ts`. Pure module, header comment, `import type` only, frozen exports, one named constant per value.
```ts
import type { LlmRoute } from './llm_routes';          // llm_limits.ts:13
export const LLM_NO_AUTO_RETRY_ROUTES: readonly LlmRoute[] = Object.freeze([ ... ] as LlmRoute[]);  // :41
```
Shape per research: `Readonly<Partial<Record<LlmRoute, {effort, maxTokens, source, p99OutputTokens, samples}>>>`. Add `LLM_TUNING_MIN_SAMPLES = 5`, `LLM_DAILY_CEILING_DEFAULT_MICRO_USD = 10_000_000n`, `LLM_PROGRESS_ROTATE_MS = 5000` in `llm_limits.ts` (retire `LLM_PHASE_SPEND_CAP_MICRO_USD` at :69).
**Test analog** `llm_limits.test.ts:1-40`: `expect(L.X).toBe(...)` pinning, plus `LLM_ROUTES`/`isLlmRoute` cross-checks. For JSON traceability read the file with `// @ts-ignore import { readFileSync } from 'node:fs'` (no @types/node; see `llm_indicator_lines.test.ts:1-6`) and assert each tuned `maxTokens === max(256, ceil(p99*1.25/256)*256)` using `percentile` from `../helpers/measurement`.
**Applying tuned values:** `llm_routes.ts:46-53` `route(maxTokens, timeoutMs, output)` with `DEFAULT_EFFORT='low'` (:44); route table is `deepFreeze({...})` (:56-65). Per-route effort needs a new optional 4th arg to `route()` or read from `llm_tuning`. Edit the pinned `llm_routes.test.ts` deliberately.

### `S/helpers/llm_stats.ts` (+ test)
**Analog:** `S/helpers/measurement.ts` `percentile` (lines 110-122: nearest-rank, throws on empty, never mutates) and the pure/duck-typed header style of `llm_admin_state.ts:1-19` ("Imports only data modules and ./measurement, so it loads in plain Node vitest").
```ts
import { percentile } from './measurement';   // handle empty route by returning zeros BEFORE calling it
```
Body: use RESEARCH "Per-route stats aggregation" verbatim (`summarizeRoute`), plus a `formatStatsLines()` that emits no `[` or `<`. `llm_call_log` columns (`schema/tables.ts:2107-2130`): `route, outcome, latencyMs: u64, costMicroUsd, createdAt?` with only `by_job`/`by_player` indexes, so the reducer does one `ctx.db.llm_call_log.iter()` (reducers may iter; views may not). Test: pure vitest, no mocks; include the empty-route and `[`/`<` guard cases.

### `scripts/llm/sweep_rules.mjs` (+ `sweep_rules.test.mjs`)
**Analog:** `scripts/llm/proof_rules.mjs` (header at :1-2: "Pure rules ... No I/O, no SDK, no secrets"), frozen arrays, bigint-safe helpers:
```js
export const PROOF_STEPS = Object.freeze([...]);                                  // :6
export function shouldStopForSpend(spent, reserved, cap, margin = PROOF_SPEND_MARGIN_MICRO_USD) {
  return BigInt(spent) + BigInt(reserved) >= BigInt(cap) - BigInt(margin);        // :23
}
export function excerpt(text, max = PROOF_EXCERPT_MAX) { return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max); }  // :79
```
Reuse `shouldStopForSpend` pattern for the sweep's own $5 guard (cap 5_000_000n). Test analog `proof_rules.test.mjs:1-20`: header `// Run from the repo root: pnpm exec vitest run --maxWorkers=1 scripts/llm/<x>.test.mjs`, imports `describe,expect,it` from vitest, `REPO_ROOT` from `./cli.mjs`, plus static guards reading the harness source (e.g. assert `sweep.live.ts` never prints the key; see `cli.test.mjs:219` `expect(setKeySrc).not.toContain('process.env')`). Tone lint should import `KEEPER_BANNED_PHRASES` from `S/data/keeper_bible` (as `llm_indicator_lines.test.ts` does) and `inferGenderFromText`.

### `scripts/llm/sweep_fixtures.mjs`
Data only, frozen. Analog: constants in `prove-live.live.ts:57-58` (`RACE_DESCRIPTION`, `NPC_MESSAGE`). Five varied inputs per route, shaped as each route's `RouteInputMap[route]` (`S/data/llm_layers.ts`), so `buildRouteLayers(route, input)` (:708) accepts them.

### `scripts/llm/sweep.live.ts`
**Analog:** `scripts/llm/prove-live.live.ts` + `vitest.live.config.ts`.
- Config: include only `*.live.ts`, `testTimeout: 1_800_000`, `fileParallelism: false` (config :14-21). Either widen `include` (already `scripts/llm/**/*.live.ts`, so `sweep.live.ts` is picked up automatically) and gate with an env var like `SWEEP_LIVE_DRY=1` mirroring `const DRY = process.env.PROVE_LIVE_DRY === '1'` (:32).
- Imports (:17-30): `import { REPO_ROOT, getCliToken, scrub } from './cli.mjs'`, plus rules from `./sweep_rules.mjs`. Key: `loadAnthropicKey()` (`cli.mjs:58`) reads `ANTHROPIC_API_KEY` with `util.parseEnv`, never `process.env`; keep it in memory, run every printed string through `scrub(text, [key])`, never print prompts or completions.
- It calls `buildClaudeRequest(route, layers)` (`S/helpers/claude_request.ts:176`) directly, overriding only `output_config.effort` and `max_tokens` on the returned body, then posts with Node `fetch` (no SDK in the repo for this). Reuse `classifyFailure`, `estimateCostMicroUsd` (`measurement.ts:333,372`). Caching proof: two sequential calls per route per effort, assert `usage.cache_read_input_tokens > 0` on the 2nd.
- Results written with `fs.writeFileSync` to `S/data/llm_measurements.json` (like `RESULTS_PATH` in prove-live :37 but at the planning-notes location).
- Paid step must stop at a `checkpoint:human-verify`; plans before it must not import results.

### New routes / schemas / layers
Closed-edit list is RESEARCH "Pattern 2" (type system flags most). Exact analog rows:
```ts
// llm_routes.ts:19-28 LLM_ROUTE_NAMES (add 'world_gen_start', 'creation_class_reveal' or chosen names)
// llm_routes.ts:56-65
world_gen: route(8192, 150_000, { kind: 'json', schema: REGION_GENERATION_SCHEMA }),
```
Schemas: follow `RACE_SCHEMA`/`REGION_GENERATION_SCHEMA` in `llm_schemas.ts` (frozen via `deepFreeze`, lint test `llm_schemas.test.ts`). Route block text: `ROUTE_BLOCKS` record at `llm_layers.ts:421` and switch at :708. Input encoding: `encodeRouteInput` in `helpers/llm_inputs.ts:30` (bigint -> string; add `ROUTE_BIGINT_PATHS` entries).
**Stage-1 enqueue/apply analog:** `helpers/world_gen.ts:154-200` (`startWorldGeneration`: builds `WorldGenInput`, `enqueueLlmJob({route, playerId, characterId, sourceKey: SOURCE_KEYS.worldGen(genState.id), request:{genStateId, input: encodeRouteInput(input)}})`, handles `result.refused` by setting step `ERROR` and appending a private/creation event, else `GENERATING`). The stage-2 enqueue copies this shape inside apply (RESEARCH Pattern 1); on refusal use `FILL_ERROR` and the same `appendPrivateEvent(..., 'system', line)` pattern.

### `/llm` command in `submit_command`
**Analog:** `S/reducers/commands.ts:235-260` (`submit_command`, `/synccontent`, `/unlockrace`). Insert the `/llm` branch right before the generic `ctx.db.command.insert` (:~297).
```ts
const trimmed = args.text.trim();
if (!trimmed) return fail(ctx, character, 'Command is empty');           // :244
const unlockRaceMatch = trimmed.match(/^\/unlockrace\s+(.+)$/i);         // :262
...
appendPrivateEvent(ctx, character.id, requirePlayerUserId(ctx), 'system', `Unlocked race: ${race.name}.`);   // :276-ish
return;
```
Differences: do NOT call `requireAdmin` (throws SenderError); check `ADMIN_IDENTITIES.has(ctx.sender.toHexString())` (`S/data/admin.ts:5`; add the import, commands.ts currently imports none from data/admin) and use `fail(ctx, character, in-voice line)` per memory rule. Stats output: one `appendPrivateEvent(..., 'system', text)` with no `[` or `<`. `on`/`off`: `patchAdminState(ctx, { llmEnabled })`.

### Admin reducers (kill switch, ceiling)
**Analog:** `S/reducers/llm.ts:21-40` (`set_api_key`) and `grant_test_pending_level` (:~84-95).
```ts
spacetimedb.reducer('set_api_key', { apiKey: t.string() }, (ctx: any, { apiKey }: { apiKey: string }) => {
  requireAdmin(ctx);
  ...
  patchAdminState(ctx, { keySet: true, ... });
});
// numeric range validation pattern:
if (levels < 1n || levels > 5n) { throw new SenderError('levels must be between 1 and 5'); }
```
Deps come from `const { spacetimedb, t, SenderError, requireAdmin, requireCharacterOwnedBy } = deps;` (:16). Smoke test cap check to replace: `reducers/llm.ts:~56-68` (`held + needed > LLM_PHASE_SPEND_CAP_MICRO_USD`). Existing test: `reducers/llm_admin.test.ts`.

### Defaulted columns / state rows
**Analog:** `S/schema/tables.ts:2180-2203` (`llm_spend`, `llm_admin_state`). Add `.default(...)` only (no clear): e.g. `llmEnabled: t.bool().default(true)`, `dailyCeilingMicroUsd: t.u64().default(10_000_000n)`, `dayUtc: t.string().default('')`, `daySpentMicroUsd: t.u64().default(0n)`. Insert sites that must supply the new fields: `ensureAdminState` (`llm_admin_state.ts:29-37`) and `ensureLedger` (`llm_budget.ts:88-99`). Fail-closed on missing row: `getAdminState(tx)` returns `undefined` (:25); seed a default row in the shared mock (`helpers/test-utils.ts` `createMockCtx`; budget tests wrap it with `strict: true`, `llm_budget.test.ts:36`, with `micros()/T_2026_09_30/T_MIDNIGHT` helpers at :48-52 reusable for the UTC rollover tests).

### Budget edits
**Analog:** `S/helpers/llm_budget.ts`. Current reserve flow (:110-130), ledger mutators `addLedgerSpend` (:198), `subtractLedgerSpend` (:208), `releaseLlmReservation` (:169), claim guard `isPhaseLedgerExhausted` (:257). Extend as RESEARCH Pattern 3. `utcDay(timestamp)` at :54 gives the day string. Keep refusal order test pinned in `llm_budget.test.ts` (flip deliberately). Extend `LlmBudgetRefusal` (:34) with `'halted' | 'ceiling'` and drop `'phase_cap'`.

### `admin_llm_status` view
**Analog:** `S/views/llm.ts:105-125`: the `AdminLlmStatus` row type lists `phaseSpentMicroUsd, phaseReservedMicroUsd, phaseCalls, phaseCapMicroUsd, inFlight`; handler returns `[]` for non-admin, uses `.id.find` and `.by_status.filter('in_flight')` only. Replace `phaseCapMicroUsd` by `dailyCeilingMicroUsd`, add `llmEnabled`, `todaySpentMicroUsd`, `todayReservedMicroUsd`; update `projectAdminLlmStatus`, `proof_rules.mjs`/`prove-live.live.ts` field uses, regenerate bindings.

### Progress pools + client rotation
**Analog:** `S/data/llm_indicator_lines.ts:25-35` (`LLM_INDICATOR_LINES: Record<string, string|null>`, import-free, frozen) and `src/composables/useLlmStatus.ts:64-107` (`selectLlmIndicator(rows, scope)` pure) / :115-130 (`useLlmStatus` thin wrapper).
```ts
const line = known ? LLM_INDICATOR_LINES[row.route] : LLM_INDICATOR_FALLBACK_LINE;   // useLlmStatus.ts:~82
```
Add `LLM_INDICATOR_POOLS: Readonly<Record<string, readonly string[]>>` (pool[0] equals today's static line) and an optional third arg `rotation = 0`: `pool[(rotation + Number(row.id)) % pool.length]`. Wrapper: `const rotation = ref(0)`, `setInterval(() => rotation.value++, LLM_PROGRESS_ROTATE_MS)` with `onUnmounted(clearInterval)`; pass into each `computed`. Keep the pure function node-testable (existing `useLlmStatus.test.ts`; no DOM). New route names must also join `LLM_INDICATOR_PRIORITY`, `LLM_CREATION_CONSOLE_ROUTES` (:49-53) and, for class stage routes, `LLM_CREATION_ONLY_ROUTES`. Copy tests to satisfy: `data/llm_indicator_lines.test.ts:36-58` (starts "The Keeper", ends `...`, no `!`, regexes `KEEPER_IT_OR_THEY`, `NEUTRAL_OR_FEMALE_PRONOUN`, banned phrases from `keeper_bible`); extend the test loop to iterate pools. Note this test needs `vi.mock('spacetimedb/server', ...createRecordingServerMock())` (:21-23) because it imports `llm_queue`.

## Shared Patterns

- **Pure-module header + frozen exports** (limits/tuning/stats/rules): see `llm_limits.ts:1-12`, `llm_admin_state.ts:1-19`, `proof_rules.mjs:1-2`.
- **Admin gating:** reducers use `requireAdmin(ctx)` (SenderError); slash commands for non-admins use `ADMIN_IDENTITIES.has(ctx.sender.toHexString())` + `fail()`; views return `[]`.
- **Money:** bigint micro-USD everywhere; no floats (ceiling dollars parsing by string math).
- **Secrets:** harness only via `loadAnthropicKey()` / `scrub()` (`cli.mjs:53-61`); static test guards on harness source.
- **Tests that load schema:** `vi.mock('spacetimedb/server', async () => (await import('../helpers/schema_recorder')).createRecordingServerMock())` and `beforeAll(async () => { await import('../schema/tables'); })` (`llm_budget.test.ts:30-34`).
- **Run commands:** root tests `pnpm exec vitest run --maxWorkers=1 <file>`; server tests `pnpm --dir spacetimedb test`; live `pnpm exec vitest run --config scripts/llm/vitest.live.config.ts`.

## No Analog Found

| File | Reason |
|---|---|
| `S/data/llm_measurements.json` | No committed JSON data file read by tests; use fs-in-test pattern above. Phase 41 precedent for a results file: `41-live-results.json` written by `prove-live.live.ts`. |
| Class-stage step machine (`CLASS_FILLING`, `CLASS_FILL_ERROR`) | Extends `helpers/creation_generation.ts` / `GENERATING_CLASS` handling in `llm_apply.ts`; planner should read those and RESEARCH Pitfall 7 (not excerpted here). |

## Metadata
**Scope searched:** `spacetimedb/src/{data,helpers,reducers,views,schema}`, `scripts/llm`, `src/composables`.
**Not read (secrets):** `.env.local`, `.dev.vars`, `llm_config`.
**Date:** 2026-09-30
