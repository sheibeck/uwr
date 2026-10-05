# Phase 41: Executor and Domain Cutover - Pattern Map

**Mapped:** 2026-09-30
**Files analyzed:** 27 new/modified
**Analogs found:** 26 / 27

All paths under `spacetimedb/src/` unless noted. "spike" = `git show e5f414d9^:spacetimedb/src/spike/...` (deleted in git history).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `schema/tables.ts` (add `LlmDispatch`, `LlmSweepTick`, `LlmPlayerBudget`, phase spend row; extend `LlmJob`/`LlmCallLog` cols) | model | CRUD + scheduled | `SpikeJob` (spike_tables.ts) + `HealthRegenTick` (tables.ts:1230) + `LlmJob` (tables.ts:2132) | exact |
| `helpers/llm_executor.ts` (new: `runLlmJob` claim/fetch/persist/apply) | service | request-response + batch | `runJobOnce` (helpers/llm_seam.test.ts:165-260) + spike `runSpec` | exact |
| `index.ts` or `reducers/llm.ts` `llm_run` procedure registration | procedure | event-driven (scheduled) | spike `spike_run_job` (`registerSpike`) | exact |
| `llm_sweep` scheduled reducer (self-reinserting, 30 s) | reducer | scheduled batch | `regen_health` (reducers/combat.ts:1358), spike `spike_tick_probe` | exact |
| `helpers/scheduling.ts` (`ensureLlmSweepScheduled`) + init call | utility | scheduled | `ensureHealthRegenScheduled` (scheduling.ts:9-16) | exact |
| `helpers/llm_budget.ts` (new: reserve/settle/refund per player-day) | service | CRUD | `helpers/llm.ts` (`checkBudget`/`incrementBudget`) + `measurement.ts:357-430` | role-match |
| `helpers/llm_queue.ts` (extend: dispatch insert, budget reserve, per-player cap) | service | CRUD | itself (`enqueueLlmJob` :99-140) | exact |
| `helpers/llm_apply.ts` (`retryWorldGen` to ERROR, clamps, `toBigIntSafe`, `serializePerkEffect`) | service | transform | itself (:66-124) | exact |
| `helpers/renown.ts` (export `serializePerkEffect`) | utility | transform | itself (:100+) | exact |
| `helpers/combat_narration.ts` (replace `llm_task.insert` :168) | service | event-driven | `enqueueLlmJob` call in `helpers/renown.ts:82-95` | exact |
| `reducers/combat.ts` (`handleVictory` :1950 / `handleDefeat` :2203, before `clearCombatArtifacts` :2146/:2247) | reducer | event-driven | existing narration trigger call sites | role-match |
| `reducers/npc_interaction.ts` (replace :95 insert, drop `incrementBudget`) | reducer | request-response | `helpers/renown.ts:82` enqueue | exact |
| `index.ts` creation/world_gen/skill_gen (lines 404-670, 889): delete `prepare_*`, enqueue in triggering reducers | reducer | request-response | `helpers/renown.ts:82` + `reducers/llm.ts` `validate_llm_request` (fail messages) | role-match |
| `reducers/intent.ts` `explore` (:1393) world-gen ERROR retry | reducer | request-response | existing explore branch | exact |
| `reducers/skill.ts` or `index.ts` `request_skill_offer` reducer | reducer | request-response | `prepare_skill_gen` (index.ts:615) | exact |
| `reducers/llm.ts` (`llm_smoke_test`, `llm_key_status` admin reducers) | reducer | request-response | `set_api_key` (reducers/llm.ts:7-19) + `grant_test_renown` (reducers/renown.ts:122) | exact |
| `data/admin.ts` (add CLI identity) | config | n/a | itself | exact |
| `views/llm.ts` (admin key-status/smoke results view, if a view is chosen) | view | request-response | `my_llm_jobs` (views/llm.ts:34-48) | role-match |
| `data/llm_budget_limits.ts` (constants: cap 4, $1/day, 200 calls, $2 phase cap) | config | n/a | `data/llm_routes.ts`, `helpers/llm.ts:2` `DAILY_LLM_BUDGET` | role-match |
| `helpers/llm_seam.test.ts` -> `helpers/llm_executor.test.ts` | test | request-response | `llm_seam.test.ts` | exact |
| sweeper / budget / cap tests | test | batch | `llm_queue.test.ts`, `test-utils.ts` `createMockProcCtx` | exact |
| `data/model_literals.test.ts` allowlist shrink | test | n/a | itself | exact |
| `src/composables/useCharacterCreation.ts:127`, `useSkillChoice.ts:54`, `useWorldGeneration.ts:49`, `useNpcConversation.ts` | hook | request-response | themselves (delete prepare calls) | exact |
| `src/App.vue:738` `useLlmProxy` | component | event-driven | stays, goes idle | n/a |
| `scripts/llm/set-key.mjs` (+`cli.mjs`) | utility | file-I/O + CLI | spike `scripts/spike/set-key.mjs`, `cli.mjs` | exact |
| `scripts/llm/live-proof.ts` | utility | request-response | spike `scripts/spike/harness.ts` | role-match |
| `docs/runbooks/llm-key.md` | docs | n/a | none | none |
| `spacetimedb/src/schema/llm_privacy.test.ts` (new tables private) | test | n/a | itself | exact |

## Pattern Assignments

### `llm_dispatch` schedule table (model, scheduled)

**Analog:** spike_tables.ts `SpikeJob` (onSchedule-bound, imports only `spacetimedb/server`):
```typescript
export const SpikeJob = table(
  { name: 'spike_job' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    runId: t.string(), ...
  }
);
```
Repo `tables.ts` uses the thunk form for scheduled reducers (tables.ts:1230-1240):
```typescript
export const HealthRegenTick = table(
  { name: 'health_regen_tick', scheduled: () => scheduledReducers['regen_health'] },
  { scheduledId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt() }
);
```
Phase 39 fact: a scheduled PROCEDURE uses `onSchedule: Table` on the `procedure()` opts (spike), so `LlmDispatch` can be a plain table (`scheduledId`, `scheduledAt`, `jobId: t.u64()`), bound at registration. Register table in the `schema({...})` block (tables.ts:2296-2306 style, e.g. `llm_dispatch: LlmDispatch`). Key gotcha: PK is `scheduledId`; delete via `ctx.db.llm_dispatch.scheduledId.delete(id)` (MEMORY.md).

### `llm_run` scheduled procedure (procedure, event-driven)

**Analog:** spike `registerSpike` (llm_spike.ts:~198-222). 4-arg named form is REQUIRED so `_wrapMethod('procedure', ...)` (index.ts:272-277: `args.length >= 4 && typeof args[0]?.name === 'string'`) exports it.
```typescript
spacetimedb.procedure(
  { name: 'spike_run_job', onSchedule: SpikeJob },
  { arg: SpikeJob.rowType },
  t.unit(),
  (ctx: any, { arg }: any) => {
    const sa = arg.scheduledAt;
    const scheduledUs = sa && sa.tag === 'Time' ? sa.value.microsSinceUnixEpoch : null;
    ...
    return {};
  },
);
```
Schedule row is already deleted when the procedure runs; everything comes from `arg`. `ctx.sender` is the module identity: read the requester from `llm_job.playerId`. `dispatchLateMs` = `tx1.timestamp - scheduledAt` (spike: `dispatchLateUs: Number(tx1Us - scheduledUs)`).

**Dispatch insert (in triggering reducer, same tx as job insert)** - from tick reinsert idiom (spike `spike_tick_probe`):
```typescript
ctx.db.llm_dispatch.insert({
  scheduledId: 0n,
  scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch),  // now; +500ms+jitter when cap full
  jobId: job.id,
});
```
Import: `import { ScheduleAt, TimeDuration } from 'spacetimedb';`

### `runLlmJob` executor body (service)

**Analog:** `runJobOnce` in `helpers/llm_seam.test.ts:165-260` (promote; do not import test file). Structure to copy:
- tx1 (:169-183): `ctx.withTx(tx => { find job; find `llm_config.id.find(1n)`; update `{...job, status:'in_flight', attempt: job.attempt+1n, startedAt: tx.timestamp}`; return plain values })`. Add in-flight cap check here (count `llm_job.by_status.filter('in_flight')`; safe because tx serialized) and budget/age checks; on cap full, insert new `llm_dispatch` row ~500 ms + jitter and return.
- Build outside tx (:186-189): `buildRouteLayers(route, input)` -> `buildClaudeRequest(route, layers)` -> `buildClaudeHeaders(read.apiKey)`.
- fetch outside any tx (:194-205):
```typescript
try {
  const res = ctx.http.fetch(ANTHROPIC_MESSAGES_URL, {
    method: 'POST', headers, body: request.bodyText,
    timeout: TimeDuration.fromMillis(request.timeoutMs),
  });
  httpStatus = res.status;
  result = classifyClaudeResponse(route, res);
} catch (err) { result = classifyClaudeError(err); }
```
- tx2 (:210-245): update job counters (4 usage fields), `status: 'received'` + `resultText/stopReason/requestId`, or retryable -> `'pending'`, else `'failed'` with `errorCode: result.class`; then `logLlmCall(tx, {...})` (llm_queue.ts:162). Add: settle cost via `settleCostMicroUsd({threw, status, usage, reservedMicroUsd})` (measurement.ts:396); thrown timeout keeps reservation (per CONTEXT).
- tx3 (:249-257): `applyLlmResult(tx, toApplyJob(job), text)` then `update({...job, status:'completed', finishedAt: tx.timestamp})`. Add: on apply throw, re-run once from stored `resultText`, then `applyLlmFailure`.
- Retry: on retryable class and attempt < 3, insert new `llm_dispatch` at `now + backoff(2s, 8s, max(retry-after), cap 60s) + jitter`. Creation/world gen never retry.
- Redaction (IN-04): `redactSecrets(msg, [storedKey])` as in spike (`redactSecrets(String(e.message), [storedKey]).slice(0,400)`).

**Spike spend-cap pattern (for $2 phase cap)**, spike llm_spike.ts:44-60:
```typescript
export const SPEND_CAP_MICRO_USD = 2_400_000n;  // code constant, no reducer can change
if (!st || st.estCostMicroUsd + st.reservedMicroUsd + reservationBig > SPEND_CAP_MICRO_USD) { capBlocked = true; return; }
tx.db.spike_state.id.update({ ...st, calls: st.calls + 1n, reservedMicroUsd: st.reservedMicroUsd + reservationBig });
```

### `llm_sweep` repeating scheduled reducer (reducer, scheduled batch)

**Analog:** `regen_health` (reducers/combat.ts:1358) registered as `scheduledReducers['regen_health'] = spacetimedb.reducer('regen_health', { arg: HealthRegenTick.rowType }, (ctx) => {...})`; self-reinsert idiom from `tick_day_night` (index.ts ~line 300):
```typescript
scheduledReducers['llm_sweep'] = spacetimedb.reducer('llm_sweep', { arg: LlmSweepTick.rowType }, (ctx) => {
  // expire/re-apply per CONTEXT rules ...
  ctx.db.llm_sweep_tick.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 30_000_000n) });
});
```
Table: `scheduled: () => scheduledReducers['llm_sweep']` (tables.ts:1230). Startup: add to `helpers/scheduling.ts`:
```typescript
export function ensureLlmSweepScheduled(ctx: any) {
  if (!tableHasRows(ctx.db.llm_sweep_tick.iter())) {
    ctx.db.llm_sweep_tick.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 30_000_000n) });
  }
}
```
and call it wherever `ensureHealthRegenScheduled` is called (init + admin resync; grep `ensureHealthRegenScheduled`). Sweeper uses `llm_job.by_status.filter('in_flight'|'received'|'pending')` (tables.ts:2132 indexes). Refund + `applyLlmFailure(ctx, toApplyJob(job))` on expiry.

### Enqueue with budget (llm_queue.ts, per-domain reducers)

**Analog:** `enqueueLlmJob` (helpers/llm_queue.ts:99-140): dedupe on `by_dedupe_key`, insert with `status:'pending'`, `attempt:0n`, four usage counters `0n`. Extend with new columns (`reservedMicroUsd`, `nextAttemptAt`, etc.; all non-optional u64 must be given in the insert, so update every test seed and `enqueueLlmJob` together). Domain call pattern (renown, helpers/renown.ts:82-95):
```typescript
enqueueLlmJob(ctx, {
  route: 'renown_perk_gen', playerId, characterId: character.id,
  sourceKey: SOURCE_KEYS.renownPerk(character.id, rank),
  request: { characterId: character.id, rank, className: ..., raceName: ..., existingPerks },
});
```
`requestJson` must carry the legacy `contextJson` keys `llm_apply` reads (`genStateId`, `characterId`, `npcId`, `memoryId`, `combatId`, `narrativeType`, `participantCharacterIds`; see `applyLlmFailure`, llm_apply.ts:82-122). Over-budget refusals use existing wording style, `reducers/llm.ts` `validate_llm_request`:
```typescript
fail(ctx, character, 'The Keeper grows weary of your demands. Return tomorrow.');
fail(ctx, character, 'The Keeper is already considering something for you. Patience.');
```
Creation (no character yet) uses `appendCreationEvent(ctx, ctx.sender, 'creation_error', ...)` (index.ts:404-415).

### Domain insert sites to replace
| Site | Current | Replace with |
|---|---|---|
| index.ts:471 `creation_race/class` (inside `prepare_creation_llm` :404) | `llm_task.insert` domain `creation_${type}` | enqueue route in the reducer that sets `GENERATING_RACE/CLASS`; delete `prepare_creation_llm` + client call `useCharacterCreation.ts:127` and its `preparedForStep` ref |
| index.ts:600 world_gen (`prepare_world_gen_llm` :486) | same | enqueue in reducer that sets genState `PENDING`; delete client `useWorldGeneration.ts:49` |
| index.ts:660 (`prepare_skill_gen` :615) and :889 (level-up path) | `llm_task.insert` skill_gen `maxTokens 1500n`, `archetype || 'warrior'` | enqueue from `apply_level_up`; add `request_skill_offer`; delete `useSkillChoice.ts:54` |
| helpers/combat_narration.ts:168 | `ctx.db.llm_task.insert({domain:'combat_narration', contextJson:{combatId, roundNumber, narrativeType, participantCharacterIds}})` | `enqueueLlmJob` route combat narration, `SOURCE_KEYS.combatNarration`; skip silently on budget; lowest priority |
| reducers/npc_interaction.ts:95 | `llm_task.insert` domain npc_conversation, ctx `{characterId, npcId, memoryId}`; then `incrementBudget(ctx, ctx.sender)` (:110) | `SOURCE_KEYS.npcConversation(charId, npcId, memory.lastUpdated micros or 0)`; remove `incrementBudget` |
| helpers/renown.ts:82 | already `enqueueLlmJob` | unchanged (only export `serializePerkEffect`) |

Combat outro: `handleVictory` (reducers/combat.ts:1950) and `handleDefeat` (:2203) call `clearCombatArtifacts(ctx, combat.id)` at :2146 / :2247; build summary and enqueue BEFORE those lines. `clearCombatArtifacts` defined :359.

### Budget table + logic (service, CRUD)

**Analog:** `helpers/llm.ts` (lines 1-51): per-player row with UTC-date reset.
```typescript
export function utcDateString(timestamp: any): string {...}
const rows = [...ctx.db.llm_budget.by_player.filter(playerId)];
if (budget.resetDate !== today) ctx.db.llm_budget.id.update({ ...budget, callCount: 0n, resetDate: today });
```
Table analog `LlmBudget` (tables.ts:1919-1932): private, `by_player` btree index. New `llm_player_budget`: `id autoInc`, `playerId identity`, `utcDate string`, `reservedMicroUsd u64`, `spentMicroUsd u64`, `callCount u64`. Reuse `utcDateString`. Cost functions (measurement.ts:372-430): `estimateCostMicroUsd(usage)`, `reserveCostMicroUsd(maxTokens, requestChars)` (chars / 3), `settleCostMicroUsd({threw,status,usage,reservedMicroUsd})`. Note `reserveCostMicroUsd` returns `number`; convert with `BigInt(...)`.

### Admin reducers (`llm_smoke_test`, `llm_key_status`)

**Analog:** `reducers/llm.ts:7-19` and `reducers/renown.ts:122`:
```typescript
spacetimedb.reducer('set_api_key', { apiKey: t.string() }, (ctx: any, { apiKey }: { apiKey: string }) => {
  requireAdmin(ctx);
  ...
});
```
Registered via `registerLlmReducers(deps)` with deps `{ spacetimedb, t, SenderError, requireAdmin, requireCharacterOwnedBy, fail }`. Smoke test enqueues via `enqueueLlmJob` with `SOURCE_KEYS.smokeTest()` (llm_queue.ts, `smokeTest: () => 'smoke'`). Key status: never return the key; read `llm_config.id.find(1n)` presence/length only, plus last smoke result. `data/admin.ts:5-8`: add CLI identity `c2002524...` (full hex in 41-RESEARCH.md; spike used `c200252497b98fff5aab75f8fbc675956b5a12a5b85042ab355d3a05c6ab7d6e`) to `ADMIN_IDENTITIES`.

### `my_llm_jobs` / admin view
`views/llm.ts:34-48` uses `t.row('MyLlmJob', {...})` and `spacetimedb.view({ name, public: true }, t.array(Row), ctx => [...index.filter(ctx.sender)])`. Views may only use index lookups (CLAUDE.md), so an admin-visible smoke result view must filter by `by_player` on `ctx.sender` (admin's own jobs) rather than scan.

### `scripts/llm/set-key.mjs` (utility)
**Analog:** `git show e5f414d9^:scripts/spike/set-key.mjs` (keep structure: `--dry-run` prints presence/len only; key via `loadAnthropicKey()` from `spacetimedb/.env.local`; stored via `spawnSync('spacetime', args, {shell:false})` in `cli.mjs` `setKeyViaCli`; confirms through `readLogs` with `scrub(l,[key])`; exit codes 0/1/2). Change reducer name to `set_api_key` and confirm via the new key-status output or a log line (add a `console.info('llm key set, len=' + n)` to the reducer as the spike did). Depends on `cli.mjs` helpers (`runSpacetime`, `scrub`, `callArgs`, `assertAllowedArgs`); restore `scripts/llm/cli.mjs` from `scripts/spike/cli.mjs` and retarget the DB name to `uwr` local only (assertAllowedArgs must refuse maincloud).

### `scripts/llm/live-proof.ts`
**Analog:** `scripts/spike/harness.ts` (SDK connection via generated bindings, subscribe to results, `redactSecrets` everything kept; imports `../../spacetimedb/src/helpers/measurement.ts`). Subscribe to `my_llm_jobs` and the admin smoke view; enforce $2 cap in-module (spike `SPEND_CAP_MICRO_USD` pattern above).

### Tests

**Analog:** `helpers/llm_seam.test.ts`.
- Header (:12-51): `vi.mock('spacetimedb/server', async () => (await import('./schema_recorder')).createRecordingServerMock())`, mock `./events`, `beforeAll(async () => { await import('../schema/tables'); })` for strict mock db.
- `createMockProcCtx({ strict, responses: [okReply(...), {throw:'timeout'}], seed })` from `helpers/test-utils.ts:232`; ctx exposes `db`, `withTx` (re-invokable), `http.fetch` (scripted; records `calls`), clock `proc.clock.now()`.
- Secret-leak assertions (:266-278): `findSecretLeaks(snapshotWithoutConfig(proc), { strictPrefix: true, needles: [FAKE_KEY] })`; `FAKE_KEY` built from fragments (:63).
- Fixtures via `fixture('ok_json')` (`helpers/__fixtures__/claude/`).
- For the registered procedure: `capturedProcedure(name)` (helpers/schema_recorder.ts:233) returns the captured handler; call `handler(ctx, { arg })`.
- Tests to update deliberately: `llm_apply.test.ts` (retryWorldGen pinned state; renown fallback snapshot; creation "validator gap" pins), `data/model_literals.test.ts` allowlist, `schema/llm_privacy.test.ts` (new tables private), `submit_llm_result.characterization.test.ts`.
- Run: `pnpm --dir spacetimedb exec vitest run --maxWorkers=1`.

## Shared Patterns

### Secret handling
**Source:** `helpers/claude_request.ts:201` `buildClaudeHeaders(apiKey)` is the only key use; `helpers/measurement.ts:432` `redactSecrets(text, needles)`. **Apply to:** executor, call log, smoke test, scripts. Never put key in `requestJson`, `llm_call_log`, or logs.

### Transaction shape
**Source:** `llm_seam.test.ts:169-257` and spike `runSpec`. Sync-only `withTx` bodies (no Promise), idempotent (platform may re-run). Procedures never touch `ctx.db`; use `tx.db`.

### Error/UX
`fail(ctx, character, msg)` where character exists (MEMORY.md preference); `SenderError` only in low-level helpers (enqueue throws plain `Error` for programming errors). Keeper voice from `helpers/llm_status.ts` `keeperMessageForJob(status, errorCode, route)` and `publicErrorBucket`.

### Scheduled table PK
Always `.scheduledId` for find/update/delete (MEMORY.md gotcha).

### Bindings
After schema change: `spacetime generate` (client bindings not hand-edited); local `--clear-database` allowed, never maincloud; `spacetime publish uwr -p spacetimedb` local only.

## No Analog Found

| File | Role | Reason |
|---|---|---|
| `docs/runbooks/llm-key.md` | docs | No existing runbooks dir; use CONTEXT sections (setup, rotation, Console spend limit, post-`--clear-database` recovery) |
| In-flight counter under concurrent procedures | service | Spike used a `spike_state` singleton counter (`inFlight` +/-1 in tx1/tx2, llm_spike.ts:44-60, 128-134); alternative is counting `llm_job.by_status.filter('in_flight')` inside tx1 (no table needed). Either is serialized by tx |

## Metadata

**Analog search scope:** spacetimedb/src (helpers, reducers, schema, views, data), src/composables, git history at e5f414d9^ (spike + scripts/spike)
**Line numbers:** current files as of HEAD 0ff95793; spike excerpts from git history, so approximate
**Pattern extraction date:** 2026-09-30
