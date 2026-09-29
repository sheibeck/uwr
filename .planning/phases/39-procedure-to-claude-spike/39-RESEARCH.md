# Phase 39: Procedure-to-Claude Spike - Research

**Researched:** 2026-09-29
**Domain:** SpacetimeDB 2.10.1 TypeScript scheduled procedures + raw HTTP to the Anthropic Messages API (`claude-sonnet-5-5`), measured from a Node 22 harness on Windows 10 against a local database
**Confidence:** MEDIUM-HIGH. API surface, typings and Anthropic request shapes are HIGH (installed 2.10.1 typings and runtime source read directly; claude-api skill). Every runtime behavior (dispatch latency, `ctx.sender` in scheduled procedures, V8 pinning effects, `between_tools` + `output_config.format`, header visibility of Anthropic-specific headers) is exactly what the spike measures and is deliberately not asserted here.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Spike isolation & environment**
- The spike code lives in the **real module** as `spacetimedb/src/spike/llm_spike.ts`, registered from `index.ts`. It is published **only to a separate local database named `uwr-spike`**:
  - This measures the real module size, cold-start and V8 cost, and imports the real prompt code.
  - The local `uwr` database is never touched.
  - `pnpm spacetime:publish` (which targets `uwr`) must not be used for the spike.
- **Maincloud is out of this phase (user decision, 2026-09-29):**
  - The gate is evaluated on local results only.
  - Maincloud behavior is proven in Phase 41, when the real executor ships. The user publishes manually; Claude never publishes to maincloud.
  - The ROADMAP and SPIKE-04 are already updated to match.
- **Cleanup:**
  - All spike code, and its registration in `index.ts`, is deleted in the phase's final commit. Git history keeps it.
  - Kept after the phase:
    - the unit-tested measurement helpers (percentile math, gate evaluation), in a non-spike location such as `spacetimedb/src/helpers/`, with tests
    - the spike record
    - the raw results JSON
  - Drop the local `uwr-spike` database at the end (`spacetime delete uwr-spike`, local only).
- **Local failure rule:** if the old 2.0.1-style failure reproduces locally, record the cause (DNS, SSRF filter, timeout, etc.) from the server logs. It is a **no-go unless a local fix is found**, because local development must be able to make LLM calls.

**API key & cost**
- **Key source:**
  - The operator puts `ANTHROPIC_API_KEY=...` in **`spacetimedb/.env.local`**. It is already gitignored and not read by Vite.
  - A spike runner script reads it and passes it to `uwr-spike`.
  - The key must never appear in shell history, commits, logs, the spike record or the results JSON.
- **Key storage in `uwr-spike`:**
  - A **spike-only key reducer** writes the existing private `llm_config` row (id 1), so the procedure reads the key the same way production will.
  - The reducer is gated to the operator's CLI identity, `c200252497b98fff5aab75f8fbc675956b5a12a5b85042ab355d3a05c6ab7d6e` (from `spacetime login show`).
  - `data/admin.ts` is **not** modified. Its admin identity `c20006ce…` differs from the CLI identity, so `set_api_key` cannot be called from the CLI.
- **Key/workspace:**
  - The user creates a **dedicated Anthropic Console workspace** (e.g. "uwr-dev") with a low spend limit (~$10) and its own key.
  - Phase 41's runbook reuses this workspace.
- **Budget:**
  - Sample sizes are designed to keep total spike spend **under ~$3**.
  - Once the key is in place, Claude runs the local live calls without per-run approval. Local only.
  - The user's only action in this phase is adding the key, plus confirming the verdict.

**Measurement design**
- **Sample sizes:**
  - Ladder:
    - rung 1: 10 public-URL fetches
    - rung 2: 10 `GET /v1/models`
    - rung 3: 30 small Sonnet 5.5 calls, for reliability
  - Structured outputs: skill and region schemas × effort `low`/`medium` × 5 runs each, plus 3 runs of a thinking-off variant (`thinking: {type: "between_tools"}`) combined with `output_config.format`.
  - Concurrency: 8 calls in flight × 3 rounds.
  - Failure drills: 2 each for a forced timeout and a bad key.
  - Dispatch latency: 50 no-op dispatches (no HTTP).
- **Reducer and tick latency:**
  - A **spike tick-probe** scheduled reducer, at the combat cadence (`COMBAT_LOOP_INTERVAL_MICROS` = 1 s), records lateness (actual `ctx.timestamp` minus scheduled time) in a spike table.
  - A small **Node harness** using the generated TypeScript SDK bindings measures `spike_ping` reducer round-trip time.
  - Both run first with no calls in flight (baseline), then with 6–8 calls in flight.
- **Dispatch latency:** measured server-side, as the schedule row's `scheduledAt` versus the procedure's start timestamp, recorded through `withTx`. It uses no-op procedures, so it's free. Also record whether `ctx.sender` is usable inside a scheduled procedure, and what it contains.
- **Current-path baseline:**
  - The OpenAI account has no credits, so measure only the **hop overhead** of today's path: client → Worker → stubbed provider response → `submit_llm_result`.
  - This quantifies what dropping the proxy saves. It is not a gate input.
- **Also captured, not gate inputs:**
  - a cache read on a repeated ≥512-token prefix (`cache_read_input_tokens > 0`)
  - whether an in-flight call survives a `spacetime publish` of `uwr-spike`
  - whether response headers (`retry-after`, `request-id`) are visible on the procedure's `SyncResponse`
  - how `ctx.http.fetch` fails on timeout: throws, or returns an error response
- **Schemas:**
  - `SKILL_GENERATION_SCHEMA` / `buildSkillGenResponseFormat()` is an OpenAI-shaped JSON schema. Map it to `output_config.format` (drop `name`/`strict`, turn `['number','null']` into `anyOf`).
  - `REGION_GENERATION_SCHEMA` is **an example-object string, not a JSON Schema**. The spike must hand-write an equivalent JSON Schema (with `additionalProperties: false`) to test whether it compiles, and record any complexity-limit error.

**Gate & decision record**
- **Gate, evaluated on local only. Go requires all of:**
  - every non-drill call succeeds, across at least 30 reliability calls
  - dispatch p95 < 250 ms
  - `spike_ping` round-trip p95 < 2× baseline, and tick lateness p95 < 2× baseline, with 6–8 calls in flight
  - the region schema compiles, or a documented staged-schema workaround exists
- **Marginal outcome:**
  - If reliability and dispatch pass but only lower concurrency stays healthy: **"go with cap"**. The in-flight cap is set to the highest concurrency that passed, with a minimum of 2, and Phase 41 enforces it.
  - **No-go** only if even 2 calls in flight break the tick or ping gate, or reliability/dispatch fail with no local fix.
- **Record:**
  - `39-SPIKE-RECORD.md` in the phase directory: narrative, environment (versions, OS), the gate table with measured values against thresholds, the decision, and the cap.
  - `39-spike-results.json`: raw samples, no key material.
  - The decision is also logged in PROJECT.md Key Decisions and in STATE.md.
- **Verdict:** evaluated automatically from the measured numbers by the unit-tested gate-evaluation helper. Claude presents the verdict and the user confirms it before Phase 40 starts.

### Claude's Discretion
- Exact file layout of the Node harness (e.g. `scripts/spike/`) and of the runner script, and how the key reaches the spike reducer without touching shell history (e.g. read from the file inside a Node script that calls the reducer through the SDK).
- The spike's table names and shapes (all private except anything the harness must read), and the result-writing format.
- The Sonnet 5.5 request body for each rung, following the research rules:
  - explicit `output_config.effort`
  - required `max_tokens`
  - no `temperature` / `top_p` / `top_k`, no `thinking: {type: "disabled"}`, no `budget_tokens`
  - parse the first `text` block
  - check `stop_reason`
- How to stub the provider for the current-path hop measurement: a temporary stub route or env flag in `llm-proxy`, run locally only via `wrangler dev`, reverted afterwards.

### Deferred Ideas (OUT OF SCOPE)
- Maincloud spike leg: moved to Phase 41 success criterion 6 (user decision).
- Instrumenting the real `combat_loop` under a live fight: not needed. The tick probe at combat cadence is the chosen proxy.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SPIKE-01 | Operator can run a throwaway procedure locally that reaches a public URL, `GET /v1/models`, and a small Sonnet 5.5 call, with results and server logs recorded | Scheduled procedure `spike_run_job` (Pattern 1) + client-callable `spike_direct_call` for first-touch feedback; request bodies (Code Examples 3-4); log capture list (Pitfall 8); DNS already verified public on this machine |
| SPIKE-02 | Structured-output calls with the real skill and region schemas at effort `low`/`medium`, plus failure shape of forced timeout and bad key | Schema mapping + hand-written region JSON Schema (Code Example 5); `between_tools` variant; drill bodies; `SyncResponse.headers` is a `Headers` object per typings (Code Example 2); fetch throws on timeout per docs |
| SPIKE-03 | Scheduled-dispatch latency, `ctx.sender` in scheduled procedures, reducer and tick latency with 6-8 in-flight | Dispatch measurement (`ctx.timestamp` vs `arg.scheduledAt`), tick probe reducer, Node SDK `spike_ping` RTT, phase labels, memory capture (Pattern 3, Code Example 6) |
| SPIKE-04 | Written go/no-go decision record on local results | Kept helper `helpers/measurement.ts` (percentile + `evaluateGate`) with unit tests; record template; cleanup/revert verification (Pattern 5) |
</phase_requirements>

## Project Constraints (from CLAUDE.md and user memory)

- Use only APIs that exist in 2.10.1 typings; **do not invent SpacetimeDB APIs**. Reducer calls use object syntax (`{ param: 'x' }`), never positional. Import `DbConnection` from the generated bindings, never from `spacetimedb`.
- Procedures have no `ctx.db`; use `ctx.withTx(tx => tx.db...)`. `withTx` bodies are synchronous and may re-run; never `fetch` inside one.
- Scheduled tables key on `scheduledId` (not `id`). Table accessors follow the schema key (this repo uses snake_case keys, e.g. `ctx.db.llm_config`).
- Make the smallest change necessary; do not touch unrelated files. Do not edit generated bindings. `--clear-database` is never used on `uwr`.
- **Never publish to maincloud** (no `--server maincloud`, no `pnpm spacetime:publishprod`). Local publish flag is `-p` (module path). Only `uwr-spike` is published in this phase; **never `pnpm spacetime:publish`** (it targets `uwr`).
- Testing mandate: every phase ships unit tests that enforce its rules (here: percentile math and gate evaluation). Vitest via `pnpm --dir spacetimedb test`.
- Server is source of truth; import server constants rather than duplicating (harness imports `COMBAT_LOOP_INTERVAL_MICROS`, prompt builders, and the kept helper from `spacetimedb/src`).
- Prefer `fail()` over `SenderError` where a character exists; spike reducers have no character, so `SenderError` is correct here (low-level, no character context).
- No LLM key may reach git, logs, shell history, the record or results JSON (CONTEXT lock, SEC-04 precursor).

## Summary

The whole spike fits in one small isolated file pair plus a Node harness, with a two-line production diff to revert. Verified in the installed 2.10.1 source: `spacetimedb.procedure({ name, onSchedule: Table }, { arg: Table.rowType }, t.unit(), fn)` is the supported binding (the `scheduled:` table option is deprecated), `ctx.http.fetch(url, { method, headers, body, timeout })` is synchronous, `timeout` is a `TimeDuration` imported from `'spacetimedb'` (not `spacetimedb/server`), the response is a `SyncResponse` whose `.headers` is a `Headers` (headers-polyfill) instance so `retry-after`/`request-id` visibility is a runtime question about what the host forwards, not a typing gap, and a timeout or network failure **throws** (docs) while a 4xx/5xx **returns**. `ctx.timestamp` inside a procedure is fixed at invocation; `tx.timestamp` inside each `withTx` is a fresh timestamp from `sys.procedure_start_mut_tx()`, which gives a server-side clock for both dispatch lateness (`ctx.timestamp - arg.scheduledAt`) and call duration (tx2 minus tx1).

The cheapest robust measurement path uses zero new dependencies. The generated bindings use extensionless imports (`from "./x_reducer"`), so plain Node 22 cannot execute them; run the harness as a Vitest "live" file (config include pattern `*.live.ts`, so `pnpm test` never runs it) from the repo root, where `spacetimedb` and `vitest` are already installed. Node 22's global `WebSocket` satisfies the SDK. The key reaches the module by a Node script that reads `spacetimedb/.env.local` and shells out to `spacetime call uwr-spike spike_set_key <json-string>` with `shell: false`, which authenticates as the CLI identity (matching the locked gate by construction) and never touches shell history. Every other spike reducer is ungated because `uwr-spike` is a local, throwaway database on 127.0.0.1. Confirm with a fake "canary" key that neither `spacetime logs` nor the server log directory (server log level is `spacetimedb=debug`) echoes reducer arguments before the real key is ever used.

Live spend is small: Sonnet 5.5 is $2/$10 per MTok in/out, the real skill prompt is about 1.2K tokens and a region reply about 2-3K, so the whole plan is roughly $1.5-2 typical and about $2.5 worst case. Enforce the budget in the module (an in-module spend cap accumulated from real `usage`), not just by trust. The main design risks are (a) tick/ping baselines that are tiny so "2x baseline" is noise-dominated, (b) an upstream Anthropic 5xx/429 failing a gate that says "every call succeeds", and (c) leaving spike tables in the working tree where a stray `pnpm spacetime:publish` would push them to `uwr`. All three have concrete mitigations below.

**Primary recommendation:** Build `spike/spike_tables.ts` + `spike/llm_spike.ts` (registered via a `registerSpike(spacetimedb)` call placed after `registerReducers(reducerDeps)` in `index.ts`, because the `_wrapMethod` monkey patch must already be installed), publish to `uwr-spike` with explicit `--no-config -p spacetimedb --server local`, drive everything from a Vitest live harness in `scripts/spike/`, keep only `helpers/measurement.ts` (+ tests), the record and the results JSON, and revert the two production-file diffs with a verified empty `git diff` against the phase-start commit.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Claude HTTP call (`ctx.http.fetch`) | Database / Storage (SpacetimeDB module, procedure) | — | The spike question is whether the module itself can be the executor; this is the tier under test |
| Dispatch (schedule row -> procedure start) | Database / Storage (scheduler) | API / Backend (harness reducer inserts the row) | Latency is server-side; measured with server timestamps only |
| API key storage | Database / Storage (private `llm_config`) | Operator machine (`.env.local`, runner script) | Same store production will use; key never touches client bundle |
| Tick / reducer latency measurement | Database / Storage (tick-probe reducer) | Harness process (Node WS client for `spike_ping` RTT) | Tick lateness is server-observable; RTT is only observable from a client |
| Measurement math + gate verdict | Harness / tooling (pure TS in `spacetimedb/src/helpers/`) | — | Pure, unit-tested, survives spike deletion; not part of the deployed module |
| Current-path hop baseline | External process (`wrangler dev` Worker) | Harness (Node `fetch`) | Measures the thing being retired; not a gate input |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `spacetimedb` (npm) | 2.10.1 (installed in root and `spacetimedb/`, `^2.10.1`) | Module runtime (procedures, `TimeDuration`, `ScheduleAt`) and Node SDK for the harness | Already the project SDK. Do not bump to 2.10.2 mid-spike |
| SpacetimeDB CLI/runtime | 2.10.1 (`spacetime --version` verified) | publish, call, generate, logs, sql, delete | Installed at `C:\Users\Dell\AppData\Local\SpacetimeDB\bin\current` |
| Vitest | 5.0.2 (root and `spacetimedb/`) | Unit tests for helpers; also the runner for the live harness | Already installed; resolves extensionless TS imports in generated bindings |
| Node | v22.23.2 (verified) | Harness runtime; global `WebSocket`; `process.loadEnvFile` | Repo floor is `>=22.12` |
| Anthropic Messages API | `POST https://api.anthropic.com/v1/messages`, `anthropic-version: 2023-06-01`, `x-api-key` | The call under test | No beta header needed for anything in this phase |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| wrangler (in `llm-proxy/node_modules`) | existing (`^4.140.0`) | `wrangler dev` for the Worker hop baseline | Only for the current-path hop measurement |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vitest as the live-harness runner | `tsx` (or bundling with esbuild) | Adds a dependency that would need the legitimacy gate and gains nothing; plain `node` cannot run the generated bindings (extensionless imports). Use only if a Wave 0 smoke test shows Vitest cannot host a long-lived WS client |
| `spacetime call` from Node for the key | SDK connection using the CLI token read from `C:\Users\Dell\AppData\Local\SpacetimeDB\config\cli.toml` | Reading `cli.toml` handles a long-lived credential (`spacetimedb_token`, `web_session_token`) for no benefit; rejected |
| Gate reducer to the harness' own identity (claim-on-first-connect) | CLI identity gate (locked) | The locked decision is simpler and safer; keep it |
| Full end-to-end current-path measurement | Composed hop measurement (Pattern 4) | Real `submit_llm_result` needs a character, prepare_* reducers, and a player identity; disproportionate for a non-gate input |

**Installation:** none. No packages are added anywhere in this phase.

**Version verification:** `node --version` = v22.23.2, `pnpm --version` = 11.23.0, `spacetime --version` = 2.10.1, `pnpm exec vitest --version` = 5.0.2 (all run this session). `spacetimedb/node_modules/spacetimedb/package.json` = 2.10.1.

## Package Legitimacy Audit

No external packages are installed or recommended in this phase (Vitest, `spacetimedb` and wrangler already exist in lockfiles). The `gsd-tools package-legitimacy` gate is therefore not applicable.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none added) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
*If a fallback runner such as `tsx` becomes necessary, it must pass the legitimacy gate and a `checkpoint:human-verify` before install (tagged `[ASSUMED]` until then).*

## Architecture Patterns

### System Architecture Diagram

```
 operator ──(1) ANTHROPIC_API_KEY in spacetimedb/.env.local (gitignored)
                     │
      scripts/spike/set-key.mjs  (Node, reads file, spawnSync shell:false)
                     │  spacetime call uwr-spike spike_set_key "<json string>"   [CLI identity c20025…]
                     ▼
 ┌───────────────────────────────  local SpacetimeDB 2.10.1 (127.0.0.1:3000), database `uwr-spike`  ─────────────────────────────┐
 │  spike_set_key (gated to CLI identity) ──► llm_config id=1 (private)                                                          │
 │                                                                                                                              │
 │  Vitest live harness (Node 22, generated bindings, WS)                                                                       │
 │    ├─ conn.reducers.spikeReset / spikeSetPhase / spikePing ─────────► spike_state (private singleton: phase, spend cap)       │
 │    ├─ conn.reducers.spikeEnqueue({runId,rung,spec,count}) ─► inserts N rows into spike_job (schedule table, scheduledAt=now)  │
 │    │                                                            │                                                            │
 │    │                                   scheduler (2.10.1: concurrent submit) ──► procedure spike_run_job(arg)               │
 │    │                                                            tx1: guard(spend cap) + read llm_config key + tx timestamp   │
 │    │                                                            fetch (OUTSIDE tx) ─► public URL | /v1/models | /v1/messages │
 │    │                                                            tx2: insert spike_result(public) + spend update             │
 │    ├─ conn.procedures.spikeDirectCall({specJson}) (client-called; #4954 and quick feedback)                                   │
 │    └─ subscribe: spike_result, spike_tick_sample (public) ◄───────────────────────── push                                     │
 │                                                                                                                              │
 │  spike_tick (schedule table) ──► reducer spike_tick_probe @1 s (COMBAT_LOOP_INTERVAL_MICROS) ──► spike_tick_sample(phase,lateUs)│
 └──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
        │ procedure egress: TLS, HTTP/1.1, public DNS only                       harness writes ─► 39-spike-results.json (leak-scanned)
        ▼
  api.anthropic.com (public 160.79.104.10 / 2607:6bc0::10, verified)      helpers/measurement.ts (percentile, evaluateGate) ─► 39-SPIKE-RECORD.md
```

### Recommended Project Structure
```
spacetimedb/src/
├── spike/                      # DELETED in the final commit
│   ├── spike_tables.ts         # tables only (no import of schema/tables.ts => no circularity)
│   └── llm_spike.ts            # registerSpike(spacetimedb): reducers + procedures + request builders
├── helpers/
│   ├── measurement.ts          # KEPT: percentile, summarize, evaluateGate (pure, no spike imports, no "spike" in name)
│   └── measurement.test.ts     # KEPT
├── schema/tables.ts            # TEMP diff: 1 import + 5 schema entries  (reverted)
└── index.ts                    # TEMP diff: 1 import + 1 call            (reverted)
scripts/spike/                  # DELETED in the final commit (repo root, outside spacetimedb/ tsconfig include ./**/*)
├── .gitignore                  # bindings/
├── config.ts                   # SPIKE_DB = 'uwr-spike' hard-coded; refuses any other name
├── set-key.mjs                 # reads .env.local, spawnSync('spacetime', [...], {shell:false})
├── harness.ts                  # connect, ping(), enqueue(), waitFor(), ResultsStore (leak-scanned)
├── rungs.live.ts               # phases; writes results incrementally
├── hop-baseline.mjs            # Worker hop timing (no bindings needed)
├── vitest.spike.config.ts      # include: ['scripts/spike/**/*.live.ts'], testTimeout 900000, fileParallelism false
└── bindings/                   # generated: spacetime generate --lang typescript --out-dir scripts/spike/bindings -p spacetimedb --no-config
.planning/phases/39-procedure-to-claude-spike/
├── 39-SPIKE-RECORD.md   ├── 39-spike-results.json   (KEPT)
```

### Pattern 1: Named scheduled procedure (verified against installed typings and runtime)
**What:** `spacetimedb.procedure({ name, onSchedule: Table }, { arg: Table.rowType }, t.unit(), (ctx, { arg }) => ...)`. `ProcedureOpts.onSchedule` is only allowed when the return type is `t.unit()`. Runtime `makeProcedureExport` pushes `{ table, functionName: name }` to `pendingSchedules`; `resolveSchedules()` requires the table handle to appear exactly once in `schema({...})` and a table bound to at most one function (so the tick probe needs its own schedule table). Reducers accept the same `onSchedule` option (`ReducerOpts`).
**Why the 4-arg form matters:** `index.ts` `_wrapMethod('procedure', ...)` returns a name only when `args.length >= 4 && typeof args[0]?.name === 'string'`; any other form gets a counter name (`_procedure_N`) and the procedure is not reachable by name. For reducers the wrapper accepts `('name', params, fn)` or `({ name, ... }, params, fn)`.
**Registration timing (critical):** ES imports are hoisted, so a side-effect import would run before `_wrapMethod` patches `spacetimedb.reducer/procedure`, and the spike exports would never enter `_moduleExports`. Export a function and call it after `registerReducers(reducerDeps);` (`index.ts` line ~ "registerReducers(reducerDeps)"), before `exportGroup`.
**Legacy alternative (not used):** `scheduled: () => scheduledReducers['x']` on the table (deprecated; the repo uses it for reducers). `onSchedule` keeps tables in a separate file with no `scheduledReducers` coupling.

### Pattern 2: Three-transaction procedure with fetch outside, server-side clocks only
tx1 (guard + key + timestamp) -> fetch (try/catch) -> tx2 (write result). Timestamps: `ctx.timestamp` (invocation, fixed), `tx.timestamp` (fresh per `withTx`, from `sys.procedure_start_mut_tx()`). Record `dispatchLateUs = ctx.timestamp - scheduledAt`, `startToTx1Us = tx1 - ctx.timestamp` (instance/tx start lag), `callMs ~ (tx2 - tx1)` (includes two tx commits, low single-digit ms). `Date.now()` is not guaranteed meaningful inside a module; record it as a cross-check only (`[ASSUMED]`, see A1).
`withTx` may re-run once (`"committing anonymous transaction failed"` retry path in `runWithTx`), so tx bodies must be idempotent: assign captured variables rather than accumulate, read state before writing.

### Pattern 3: Measurement control loop (one connection, phase labels)
1. `spikeReset({ capMicroUsd })` upserts `spike_state` (id 1n), clears result/tick tables, starts the tick probe.
2. `spikeSetPhase('baseline')`; harness pings `spike_ping` every 50 ms for >= 60 s (>= 1000 RTT samples, >= 55 tick samples).
3. `spikeSetPhase('load8')`; enqueue 8 region calls (effort `low`), keep pinging at 50 ms until 8 results arrive; repeat 3 rounds; total load window must be >= 50 s to yield >= 50 tick samples (region-schema calls take ~10-25 s, which satisfies this; a 5-8 s skill call does not).
4. `spikeSetPhase('baseline2')` (control): repeat baseline after load. **Compare baseline vs baseline2 as the noise floor** before trusting a 2x ratio. Step down (4, then 2 in flight) only if 8 fails (the "go with cap" ladder).
5. Server memory evidence for #4697: PowerShell `Get-Process spacetimedb-standalone | Select Id,WorkingSet64,@{n='Threads';e={$_.Threads.Count}}` at baseline, right after load8, and after 60 s idle (pool never shrinks).
`performance.now()` around `await conn.reducers.spikePing({...})` is the RTT: reducer calls return `Promise<void>` that resolves on the server's reducer result (typings: `callReducerWithParams(...): Promise<void>`).

### Pattern 4: Current-path hop overhead, composed rather than end-to-end (recommended)
End-to-end needs a real character, `prepare_*` reducers, a player identity and a pending `llm_task`; that is disproportionately expensive for a non-gate input. Compose it from three cheap, real measurements and label it a lower bound:
1. **Worker hop (zero source diff):** with `wrangler dev --port 8787`, time `POST /api/llm` with the valid bearer (read `PROXY_SECRET` from `llm-proxy/.dev.vars` in-process, never print) and a body that omits `systemPrompt`. The route returns `400 Missing required fields` **before** constructing the OpenAI client (verified in `llm-proxy/src/index.ts`), so this times Hono routing + auth middleware + JSON parse = the proxy's own hop cost with no provider call. n=50 from Node `fetch`. If exactness is wanted, a temporary 3-line `if (c.env.STUB_PROVIDER) return c.json({ok:true,text:'{}',usage:{inputTokens:1,outputTokens:1}})` before `new OpenAI(...)` is optional, reverted with `git checkout -- llm-proxy/src/index.ts`.
2. **Reducer legs:** `spike_ping` RTT (a proxy for `submit_llm_result` acknowledgement and for the `prepare_*` write).
3. **Subscription push leg:** time from a reducer call to the `onInsert` callback for a public spike row (the moment a client would see a new `llm_task`, or see the applied result).
Current path overhead ~ (reducer RTT + push) [task visible] + Worker hop + (reducer RTT + push) [submit + result visible]; procedure path overhead ~ reducer RTT + dispatch + apply-tx + push. Report both as p50/p95 with the assumption spelled out. Requires `wrangler dev` (cleanup on Windows per the run-local skill: `workerd.exe` and wrangler `node.exe` survive TaskStop).

### Pattern 5: Fully-revertible production diff
Exactly two production files change, by additive lines only:
- `spacetimedb/src/schema/tables.ts`: `import { SpikeJob, SpikeTick, SpikeResult, SpikeTickSample, SpikeState } from '../spike/spike_tables';` plus five keys inside `schema({...})` (`spike_job`, `spike_tick`, `spike_result`, `spike_tick_sample`, `spike_state`).
- `spacetimedb/src/index.ts`: `import { registerSpike } from './spike/llm_spike';` and `registerSpike(spacetimedb);` immediately after `registerReducers(reducerDeps);`.
Record the phase-start SHA (`a088f28f` at research time; use HEAD when execution starts). Cleanup verification (all must hold): `git diff <start-sha> -- spacetimedb/src/index.ts spacetimedb/src/schema/tables.ts` is empty; `git grep -il spike -- spacetimedb/src` prints nothing (this is why the helper must not be named `*spike*`); `spacetimedb` builds (`pnpm --dir spacetimedb exec spacetime build` or `spacetime build -p spacetimedb`) and tests pass; `spacetime list`/server list shows no `uwr-spike`; `scripts/spike/` gone.

### Anti-Patterns to Avoid
- **`fetch` inside `withTx`, `async` `withTx` callbacks, capturing accumulators in `withTx`** (Pitfall 4 in milestone research). A static grep test on the spike file is cheap.
- **Reading the schedule row inside the scheduled procedure:** it is deleted before the procedure runs; carry everything in `arg`.
- **Keeping a spike table registration but not the file (or the reverse):** `resolveSchedules()` throws "Schedule target table is not part of this schema" / "associated function was not exported".
- **Using `spacetime publish` without an explicit DB name, or from a tree with `spacetime.local.json` in effect:** the repo has `spacetime.local.json` with `{"database":"uwr"}` and `spacetime.json` with `module-path`/`server`. Always pass `--no-config`, the literal name `uwr-spike`, `-p spacetimedb`, and `--server local`.
- **Trusting `withTx` order for elapsed time inside one tx:** timestamps advance only between transactions.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| `.env` parsing | custom parser / `dotenv` | `process.loadEnvFile('spacetimedb/.env.local')` (Node >= 22) then `.trim()` the value | CRLF and quoting bugs give a silent 401; built-in avoids a dependency |
| Key transport | reading the CLI token file, custom WS auth | `spawnSync('spacetime', ['call', ...], { shell: false })` | Authenticates as the CLI identity, no credential file handling, no shell history |
| Percentile method | ad hoc `sort()[floor(p*n)]` scattered across scripts | one `percentile()` in `helpers/measurement.ts` (nearest-rank) with tests | Off-by-one at n=50, p95 decides the gate |
| TS runner for the harness | `tsx`, custom loaders | Vitest with a spike config | Already installed, resolves extensionless imports |
| Timeouts / error shape detection | string-matching exception text for classification | classify `threw` vs `status`; record `error.message` verbatim (redacted) | The shape is the finding |
| Secrets leak checks | eyeballing | one `assertNoSecrets(text, key)` used by the ResultsStore, plus grep of logs for a canary | The key must not appear in JSON, record, logs or git |
| Spend control | trusting the console limit alone | in-module cap accumulated from `usage` (Anthropic prices) | Prevents a self-rescheduling bug from burning the workspace |

**Key insight:** the only genuinely new code that must be right is small: request-body builders (pure), the percentile/gate helper (unit-tested), and the leak/spend guards. Everything else is glue around verified platform APIs.

## Runtime State Inventory

Not a rename/refactor/migration phase (greenfield throwaway + revert). One equivalent hazard applies: **build/runtime artifacts that outlive the code**.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `uwr-spike` local database contains the Anthropic key in private `llm_config` and all spike rows | `spacetime delete uwr-spike --server local -y` at the end; results JSON has no key |
| Live service config | `wrangler dev` (workerd) and `spacetimedb-standalone.exe` started for the spike | Stop and confirm `netstat` shows ports 3000/8787 free (run-local skill) |
| OS-registered state | None | None |
| Secrets/env vars | `spacetimedb/.env.local` holds the key (gitignored, verified by `git check-ignore`); `llm-proxy/.dev.vars` holds `PROXY_SECRET` (gitignored) | Leave `.env.local` in place for Phase 41 (same workspace); never print either |
| Build artifacts | `scripts/spike/bindings/` (generated), leftover spike tables in the working tree schema | Delete `scripts/spike/`; revert the two production diffs; verify empty `git diff` (Pattern 5) |

## Common Pitfalls

### Pitfall 1: Spike tables pushed to `uwr` by a stray publish
**What goes wrong:** Between the spike commit and the cleanup commit the working tree's `schema()` contains spike tables; `pnpm spacetime:publish` (used routinely in other phases and auto-allowed locally) would add them to `uwr` and start the tick probe machinery's tables there.
**How to avoid:** No publish to `uwr` during this phase; all runner scripts hard-code `SPIKE_DB = 'uwr-spike'` and refuse anything else and any `maincloud` server. Verify cleanup with Pattern 5 before the phase is declared done; execute the cleanup commit in the same session as the verdict confirmation.
**Warning signs:** `spacetime sql uwr "select * from spike_state"` succeeds.

### Pitfall 2: Two-times-baseline is meaningless when the baseline is tiny
**What goes wrong:** Idle local tick lateness may be ~1-3 ms and ping RTT ~2-6 ms; 2x of that is inside Windows scheduling noise (15.6 ms timer granularity affects `setInterval` pacing, not `performance.now()`), so a healthy system fails or an unhealthy one passes by luck.
**How to avoid:** collect large baselines (>= 1000 ping samples, >= 55 tick samples), run the control baseline2, report the baseline-vs-baseline2 ratio, and have `evaluateGate` accept an optional `noiseFloorMs` (default 0 = strict locked gate). Present strict and floor-adjusted verdicts side by side in the record; the locked rule stays the strict one and the user confirms. See Open Question 2.

### Pitfall 3: An Anthropic 5xx/429/529 fails a gate that says "every call succeeds"
**What goes wrong:** One transient upstream error in ~130 calls flips go to no-go although the platform is fine (or the reverse: a platform timeout is mislabeled as upstream).
**How to avoid:** classify every failure as `platform` (fetch threw, DNS/egress error, procedure trap, missing result row) or `upstream` (HTTP 429/5xx/529 body with an Anthropic error type). Strict verdict counts both (locked rule); the record lists upstream-only failures separately for the user's confirmation. Success definition: HTTP 200 and `stop_reason === 'end_turn'` and, for structured calls, `JSON.parse` ok and the top-level required keys present (a `refusal` or `max_tokens` stop is a failure).

### Pitfall 4: The 2.0.1-style failure reproduces locally for a non-timeout reason
**What goes wrong:** Public host resolves to a blocked range on this machine (#4715, #4546), or module egress is disabled (`[module-http] enabled = false`, 2.9.0+). Host log line `ProcedureHttpRequest returned errno: 21`, message `dns error: refusing to connect to private or special-purpose addresses`.
**Current state (verified this session):** `nslookup api.anthropic.com` returns public `160.79.104.10` and `2607:6bc0::10` via Comcast DNS; `curl https://api.anthropic.com/v1/models` returns 401 in 0.38 s (network path fine); the local `data/config.toml` has no `[module-http]` section (default enabled). No VPN/fake-IP resolver is evident. If a rung fails, capture: `spacetime logs uwr-spike -n 300 --format json`, the newest files in `C:\Users\Dell\AppData\Local\SpacetimeDB\data\logs\` (host-level errors such as errno 21 land there, not always in module logs), `nslookup` and `curl -sS -w` timing for the failing host, `spacetime version`, `data\config.toml`, and the exact thrown message recorded in `spike_result.dataJson`. The IPv6 answer means a resolver that filters IPv6 differently is one more thing to test (compare `nslookup -type=A` vs `AAAA`).

### Pitfall 5: Client identity vs gate identity mismatch
**What goes wrong:** The CLI token in `cli.toml` (`spacetimedb_token`) was issued by the spacetimedb.com login; the local server may accept it but map to a different identity than `spacetime login show` prints, or reject it. `spike_set_key` then throws `SenderError` and the key is never stored.
**How to avoid:** Wave 0 runs `spike_whoami` (logs `ctx.sender.toHexString()`; identities are not secret) via `spacetime call uwr-spike spike_whoami` and compares to `c200252497b98fff5aab75f8fbc675956b5a12a5b85042ab355d3a05c6ab7d6e`. `spike_set_key` must log the sender hex on rejection so the operator can see the actual identity.

### Pitfall 6: Reducer arguments echoed by server logs or the CLI
**What goes wrong:** The server runs `spacetimedb=debug`, `spacetimedb_client_api=debug` (data/config.toml). Whether reducer arguments or HTTP request details appear in logs is unverified. The key is also visible in `spacetime call` argv (transient, single-user machine) and could be echoed by CLI error text.
**How to avoid:** Canary test before the real key: set a fake key `sk-ant-CANARY-<random>`, call one bad-key drill and one `spike_direct_call`, then grep `spacetime logs uwr-spike` output, the entire `data\logs\` directory, and the harness stdout for the canary. Only after a clean scan use the real key. The runner captures the child process output and passes it through `redact()` before printing. The results ResultsStore runs `assertNoSecrets` on every write.

### Pitfall 7: Region schema compiles but first-call latency is 1-2 s (grammar compile), skewing effort comparison
**What goes wrong:** the first request per new schema pays a one-time compile (cached 24 h), so run 1 of each schema cell is an outlier.
**How to avoid:** record per-run values, tag `run 0` as `cold`, and compute p50/p95 both with and without the cold sample. Schema changes between runs (even key order) re-trigger compile: build schemas as module-level constants and never mutate them.

### Pitfall 8: `between_tools` combined with `output_config.format` may 400
Documented separately (Sonnet 5.5 only, effort `high` or below, no other field in `thinking`) but the combination is untested. A 400 is a valid finding: record the exact error `message`, mark the variant "not composable", and do not count these 3 runs toward reliability (they are an exploratory variant). If accepted, run it at `medium` (where thinking cost matters) so the comparison with adaptive `medium` is meaningful.

### Pitfall 9: Publish-survival test needs a byte-different module
Republishing an identical module may not restart the module instance. Keep a `SPIKE_BUILD_TAG` string constant, change it between the two publishes, start a long region call (`medium` effort, ~20 s), publish the second build while it is in flight, then record whether a result row appears and what `spacetime logs` shows (#5220: procedures cannot be told to stop). The schedule row is already deleted, so a missing result row means the job is lost.

### Pitfall 10: Windows process hygiene
`spacetime start` and `wrangler dev` children survive TaskStop (run-local skill). Start each with `run_in_background`, then stop with the documented `Get-CimInstance Win32_Process` / `Stop-Process` recipe and confirm `netstat -ano | findstr ":3000 :8787"` is empty. Do not kill a `spacetimedb-standalone.exe` the user started themselves; check `netstat` first (server not running at research time).

### Pitfall 11: Tick-sample starvation
A 1 s probe yields one sample per second; a 20 s load round yields ~20. Gate on the concatenated load window (>= 50 samples), report `n` next to each p95, and let `evaluateGate` return `incomplete` when sample counts are below minimums (ping >= 200, tick >= 30, dispatch >= 50, reliability >= 30).

## Code Examples

### 1. Tables (`spike/spike_tables.ts`, no import of `schema/tables.ts`)
```ts
// Source: installed spacetimedb@2.10.1 typings (table(), t.scheduleAt(), private by default)
import { table, t } from 'spacetimedb/server';

export const SpikeJob = table(
  { name: 'spike_job' }, // private schedule table, bound by procedure onSchedule
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    runId: t.string(),
    rung: t.string(),
    seq: t.u32(),
    specJson: t.string(),
  }
);
export const SpikeTick = table(
  { name: 'spike_tick' },
  { scheduledId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt() }
);
export const SpikeResult = table( // PUBLIC: harness subscribes; contains no secrets (redacted, no full bodies)
  { name: 'spike_result', public: true },
  { id: t.u64().primaryKey().autoInc(), runId: t.string(), rung: t.string(), seq: t.u32(), ok: t.bool(), dataJson: t.string() }
);
export const SpikeTickSample = table(
  { name: 'spike_tick_sample', public: true },
  { id: t.u64().primaryKey().autoInc(), phase: t.string(), lateUs: t.i64(), gapUs: t.i64() }
);
export const SpikeState = table(
  { name: 'spike_state' },
  { id: t.u64().primaryKey(), phase: t.string(), probeOn: t.bool(), lastTickUs: t.i64(),
    calls: t.u64(), estCostMicroUsd: t.u64(), capMicroUsd: t.u64(), pings: t.u64() }
);
```

### 2. Scheduled procedure skeleton (`spike/llm_spike.ts`; sketch, types are `any` like the repo's reducers)
```ts
// Source: procedures.d.ts / http_internal.d.ts / runtime makeProcedureExport in spacetimedb@2.10.1
import { t, SenderError } from 'spacetimedb/server';
import { ScheduleAt, TimeDuration } from 'spacetimedb';          // TimeDuration is NOT exported by 'spacetimedb/server'
import { COMBAT_LOOP_INTERVAL_MICROS } from '../data/combat_constants';
import { SpikeJob, SpikeTick } from './spike_tables';

const CLI_IDENTITY = 'c200252497b98fff5aab75f8fbc675956b5a12a5b85042ab355d3a05c6ab7d6e';
export const SPIKE_BUILD_TAG = 'a';                              // change between publishes for the survive-publish test
const redact = (s: string) => s.replace(/sk-ant-[A-Za-z0-9_-]+/g, 'sk-ant-***');

function runSpec(ctx: any, scheduledUs: bigint | null, runId: string, rung: string, seq: number, spec: any): string {
  const startedUs: bigint = ctx.timestamp.microsSinceUnixEpoch;
  let key = ''; let allowed = false; let tx1Us = 0n;
  ctx.withTx((tx: any) => {                                     // sync, idempotent
    tx1Us = tx.timestamp.microsSinceUnixEpoch;
    const st = tx.db.spike_state.id.find(1n);
    allowed = !!st && st.estCostMicroUsd < st.capMicroUsd;
    key = tx.db.llm_config.id.find(1n)?.apiKey ?? '';
    if (st) tx.db.spike_state.id.update({ ...st, calls: st.calls + 1n });
  });
  const d: any = { seq, rung, senderHex: ctx.sender.toHexString(), isModuleIdentity: ctx.sender.toHexString() === ctx.databaseIdentity.toHexString(),
                   hasConnectionId: ctx.connectionId !== null, dispatchLateUs: scheduledUs === null ? null : Number(startedUs - scheduledUs),
                   startToTx1Us: Number(tx1Us - startedUs), buildTag: SPIKE_BUILD_TAG };
  if (spec.kind !== 'noop') {
    if (!allowed) d.error = { kind: 'spend_cap' };
    else {
      try {                                                     // fetch OUTSIDE any tx
        const res = ctx.http.fetch(spec.url, { method: spec.method ?? 'GET', headers: spec.headers(key), body: spec.body, timeout: TimeDuration.fromMillis(spec.timeoutMs ?? 120_000) });
        d.status = res.status;
        const names: string[] = []; res.headers.forEach((_v: string, k: string) => names.push(k));
        d.headerNames = names; d.requestId = res.headers.get('request-id'); d.retryAfter = res.headers.get('retry-after');
        d.bodyText = res.text();                                // parse in try/catch downstream; store only usage/stop_reason/parse flags
      } catch (e: any) { d.threw = true; d.error = { kind: 'threw', message: redact(String(e?.message ?? e)).slice(0, 400) }; }
    }
  }
  let tx2Us = 0n;
  ctx.withTx((tx: any) => {
    tx2Us = tx.timestamp.microsSinceUnixEpoch;
    /* cost from parsed usage: in*2 + out*10 + cw*2.5 + cr*0.2 (micro-USD per token); update spike_state.estCostMicroUsd */
    tx.db.spike_result.insert({ id: 0n, runId, rung, seq, ok: !d.error && (d.status === undefined || d.status === 200), dataJson: JSON.stringify({ ...d, callUs: Number(tx2Us - tx1Us) }) });
  });
  return JSON.stringify(d);
}

export function registerSpike(spacetimedb: any) {
  spacetimedb.procedure(                                        // 4-arg form so _wrapMethod exports it by name
    { name: 'spike_run_job', onSchedule: SpikeJob },
    { arg: SpikeJob.rowType }, t.unit(),
    (ctx: any, { arg }: any) => {
      const sa = arg.scheduledAt;                               // ScheduleAt tagged union
      runSpec(ctx, sa.tag === 'Time' ? sa.value.microsSinceUnixEpoch : null, arg.runId, arg.rung, arg.seq, JSON.parse(arg.specJson));
      return {};
    });
  spacetimedb.procedure({ name: 'spike_direct_call' }, { specJson: t.string() }, t.string(),   // client-callable: quick feedback + #4954
    (ctx: any, { specJson }: any) => runSpec(ctx, null, 'direct', 'direct', 0, JSON.parse(specJson)));
  spacetimedb.reducer({ name: 'spike_tick_probe', onSchedule: SpikeTick }, { arg: SpikeTick.rowType }, (ctx: any, { arg }: any) => {
    const st = ctx.db.spike_state.id.find(1n); if (!st || !st.probeOn) return;
    const now = ctx.timestamp.microsSinceUnixEpoch; const sched = arg.scheduledAt.tag === 'Time' ? arg.scheduledAt.value.microsSinceUnixEpoch : now;
    ctx.db.spike_tick_sample.insert({ id: 0n, phase: st.phase, lateUs: now - sched, gapUs: st.lastTickUs === 0n ? 0n : now - st.lastTickUs });
    ctx.db.spike_state.id.update({ ...st, lastTickUs: now });
    ctx.db.spike_tick.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.time(now + COMBAT_LOOP_INTERVAL_MICROS) }); // same self-scheduling as combat.ts:1487
  });
  spacetimedb.reducer('spike_ping', { nonce: t.u64() }, (ctx: any) => { const st = ctx.db.spike_state.id.find(1n); if (st) ctx.db.spike_state.id.update({ ...st, pings: st.pings + 1n }); }); // one tiny private write
  spacetimedb.reducer('spike_enqueue', { runId: t.string(), rung: t.string(), specJson: t.string(), count: t.u32() }, (ctx: any, a: any) => {
    for (let i = 0; i < a.count; i++) ctx.db.spike_job.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch), runId: a.runId, rung: a.rung, seq: i, specJson: a.specJson });
  });
  spacetimedb.reducer('spike_set_key', { apiKey: t.string() }, (ctx: any, { apiKey }: any) => {
    if (ctx.sender.toHexString() !== CLI_IDENTITY) { console.error('spike_set_key rejected, sender=' + ctx.sender.toHexString()); throw new SenderError('not the CLI identity'); }
    if (!apiKey.trim()) throw new SenderError('empty key');
    const row = ctx.db.llm_config.id.find(1n);
    if (row) ctx.db.llm_config.id.update({ ...row, apiKey: apiKey.trim(), updatedAt: ctx.timestamp });
    else ctx.db.llm_config.insert({ id: 1n, apiKey: apiKey.trim(), updatedAt: ctx.timestamp });
    console.info('spike key set, len=' + apiKey.trim().length);   // never log the value
  });
  // also: spike_reset(capMicroUsd) [upsert state, clear results/ticks, seed first spike_tick row], spike_set_phase(label), spike_whoami (log sender hex)
}
```
`tx.db.<table>` uses the schema key (`spike_state`, `llm_config`), the same convention as the repo. `res.headers.forEach/get` is the headers-polyfill `Headers` API (typings: `SyncResponse.headers: Headers`).

### 3. Request bodies (Sonnet 5.5; sources: claude-api skill + STACK.md)
Headers for every call: `content-type: application/json`, `anthropic-version: 2023-06-01`, `x-api-key: <key>`. No `anthropic-beta`. Never send `temperature/top_p/top_k`, `thinking: {type:'disabled'}`, `budget_tokens`, `tool_choice` forced, or assistant prefill (all 400 on Sonnet 5.5).
```jsonc
// rung 3 minimal (30x): explicit effort, required max_tokens
{ "model":"claude-sonnet-5-5", "max_tokens":64, "output_config":{"effort":"low"},
  "messages":[{"role":"user","content":"Reply with exactly: pong"}] }

// structured (skill schema, effort low|medium); system carries the stable prefix and the cache breakpoint
{ "model":"claude-sonnet-5-5", "max_tokens":2048,
  "system":[{"type":"text","text":"<buildSkillGenSystemPrompt()>","cache_control":{"type":"ephemeral"}}],
  "output_config":{"effort":"medium","format":{"type":"json_schema","schema":{/* mapped skill schema, Example 5 */}}},
  "messages":[{"role":"user","content":"<buildSkillGenUserPrompt(...) cut before 'Respond with ONLY valid JSON matching this schema:'>"}] }

// structured (region): system = buildWorldGenPrompt(ctx string), user = buildRegionGenerationUserPrompt(...) cut the same way, max_tokens 6000

// thinking-off variant (Sonnet 5.5 only; effort must be high or lower; NOTHING else inside thinking)
{ ...structuredBody, "thinking":{"type":"between_tools"} }   // effort "medium" for the comparison with adaptive medium

// cache check: send the identical skill body twice sequentially (same effort, same schema, same bytes):
//   call 1: usage.cache_creation_input_tokens > 0;  call 2: usage.cache_read_input_tokens > 0
//   (system prefix ~1.2K tokens > 512 minimum for Sonnet 5.5; do not vary any byte before the breakpoint)

// bad key drill: same minimal body with header x-api-key: sk-ant-invalid-spike  -> 401, body {"type":"error","error":{"type":"authentication_error",...}}, RETURNS (does not throw)
// forced timeout drill: minimal body with timeout: TimeDuration.fromMillis(50)  -> docs: throws; record the exact message
// rung 1: GET https://example.com/ (verified reachable, 200 in 0.8 s); rung 2: GET https://api.anthropic.com/v1/models with x-api-key + anthropic-version
```
Parse rule: take the first block with `type === 'text'` (a `thinking` block with empty text can come first under adaptive thinking), check `stop_reason` (`end_turn` ok; `max_tokens` and `refusal` = failure, record `stop_details.category`), then `JSON.parse` in try/catch. Usage: `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`. Response headers of interest: `request-id`, `retry-after` (429 only). [CITED: claude-api skill error-codes.md]

### 4. Schema mapping (skill) and hand-written region JSON Schema
```ts
// OpenAI shape -> output_config.format schema: take buildSkillGenResponseFormat().json_schema.schema, then:
function toAnthropicSchema(n: any): any {
  if (Array.isArray(n)) return n.map(toAnthropicSchema);
  if (n && typeof n === 'object') {
    if (Array.isArray(n.type) && n.type.includes('null')) {        // ['number','null'] -> anyOf (type arrays are undocumented)
      const { type, description, ...rest } = n; const base = type.filter((x: string) => x !== 'null');
      return { ...(description ? { description } : {}), anyOf: [...base.map((x: string) => ({ type: x, ...rest })), { type: 'null' }] };
    }
    return Object.fromEntries(Object.entries(n).map(([k, v]) => [k, toAnthropicSchema(v)]));
  }
  return n;
}
// Region: REGION_GENERATION_SCHEMA is an example string; hand-write (all fields required, additionalProperties:false on EVERY object incl. personality)
const obj = (props: any) => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props });
const S = { type: 'string' }; const strs = { type: 'array', items: S };
export const REGION_JSON_SCHEMA = obj({
  regionName: S, regionDescription: S,
  biome: { type: 'string', enum: ['volcanic','forest','tundra','desert','swamp','mountains','plains','coastal','cavern','ruins'] },
  dominantFaction: S, landmarks: strs, threats: strs,
  locations: { type: 'array', items: obj({ name: S, description: S,
    terrainType: { type: 'string', enum: ['mountains','woods','plains','swamp','dungeon','town','city'] },
    isSafe: { type: 'boolean' }, levelOffset: { type: 'integer' }, connectsTo: strs }) },
  npcs: { type: 'array', items: obj({ name: S, npcType: { type: 'string', enum: ['vendor','questgiver','lore','trainer','guard','crafter','banker'] },
    locationName: S, description: S, greeting: S,
    personality: obj({ traits: strs, speechPattern: S, knowledgeDomains: strs, secrets: strs, affinityMultiplier: { type: 'number' } }) }) },
  enemies: { type: 'array', items: obj({ name: S, creatureType: { type: 'string', enum: ['beast','undead','humanoid','elemental','construct','aberration'] },
    role: { type: 'string', enum: ['melee','ranged','caster'] }, terrainTypes: S, groupMin: { type: 'integer' }, groupMax: { type: 'integer' }, level: { type: 'integer' } }) },
});
```
No numeric/string constraints, no recursion, no optionals (so no optional-parameter explosion); 4 nested object types and 5 enums. Complexity errors, if any, come back as a 400 whose `message` must be stored verbatim (the "documented staged-schema workaround" input for the gate).

### 5. Node harness essentials (`scripts/spike/`)
```ts
// vitest.spike.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['scripts/spike/**/*.live.ts'], testTimeout: 900_000, hookTimeout: 120_000, fileParallelism: false } });
// run:  pnpm exec vitest run --config scripts/spike/vitest.spike.config.ts   (from repo root)

// connect (Node 22 has global WebSocket; SDK falls back to undici only on Node 18-21)
import { DbConnection } from './bindings';
const conn = await new Promise<DbConnection>((res, rej) => {
  const c = DbConnection.builder().withUri('ws://127.0.0.1:3000').withDatabaseName('uwr-spike')
    .onConnect((cc) => { cc.subscriptionBuilder().onApplied(() => res(cc)).subscribe(['SELECT * FROM spike_result', 'SELECT * FROM spike_tick_sample']); })
    .onConnectError((_c, e) => rej(e)).build();
});
const t0 = performance.now(); await conn.reducers.spikePing({ nonce: 1n }); const rttMs = performance.now() - t0;   // Promise<void> resolves on reducer result
// #4954: const p = conn.procedures.spikeDirectCall({ specJson });  then time `await conn.reducers.spikePing(...)` while p is pending (same connection), then compare to a second connection
```
Anonymous first connect yields a fresh identity each run (no token persistence needed). The generated shape of `conn.procedures.*` and the exact builder method names must be confirmed in the Wave 0 smoke (`withDatabaseName` is confirmed from typings and `src/main.ts`).

Key runner (`set-key.mjs`), never echoing the key:
```js
import { spawnSync } from 'node:child_process';
process.loadEnvFile('spacetimedb/.env.local');
const key = (process.env.ANTHROPIC_API_KEY ?? '').trim();
if (!/^sk-ant-/.test(key)) { console.error('ANTHROPIC_API_KEY missing or malformed in spacetimedb/.env.local'); process.exit(2); }
const r = spawnSync('spacetime', ['call', '--no-config', '--server', 'local', 'uwr-spike', 'spike_set_key', JSON.stringify(key)], { shell: false, encoding: 'utf8' });
const scrub = (s) => (s ?? '').split(key).join('[REDACTED]');
console.log(scrub(r.stdout)); console.error(scrub(r.stderr)); process.exit(r.status ?? 1);
```
(`spacetime call` takes JSON-typed positional arguments; the STACK.md example quotes a string argument. Confirm quoting with the canary in Wave 0.)

### 6. Kept helper contract (`spacetimedb/src/helpers/measurement.ts`)
```ts
export function percentile(samples: readonly number[], p: number): number;      // nearest-rank: sorted[ceil(p/100*n)-1]; n=50,p=95 -> 48th; throws on empty; does not mutate input
export function summarize(samples: readonly number[]): { n: number; min: number; p50: number; p95: number; p99: number; max: number; mean: number };
export type Verdict = 'go' | 'go_with_cap' | 'no_go' | 'incomplete';
export function evaluateGate(input: {
  reliability: { calls: number; failures: number; platformFailures?: number; upstreamFailures?: number };  // non-drill only
  dispatchP95Ms: number; dispatchSamples: number;
  regionSchemaCompiles: boolean; stagedWorkaroundDocumented: boolean;
  baseline: { pingP95Ms: number; tickLateP95Ms: number };
  loads: { inFlight: number; pingP95Ms: number; tickLateP95Ms: number; pingSamples: number; tickSamples: number }[];
  thresholds?: { dispatchP95Ms?: number /*250*/; ratio?: number /*2*/; minReliabilityCalls?: number /*30*/; noiseFloorMs?: number /*0*/ };
}): { verdict: Verdict; cap: number | null; checks: { name: string; pass: boolean; measured: number | string; threshold: number | string }[] };
```
Verdict rules (from the locked gate): `incomplete` if sample minimums are unmet; `no_go` if reliability or dispatch fails, or the region schema neither compiles nor has a documented workaround, or no tested load level >= 2 passes ping and tick; `go` if the highest tested level (>= 6) passes ping and tick p95 < ratio x baseline; otherwise `go_with_cap` with `cap = max(2, highest passing inFlight)`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Table option `scheduled: () => reducerExport` | `spacetimedb.reducer/procedure({ name, onSchedule: table }, ...)` | 2.x (typings mark `scheduled` deprecated) | Tables can live in a file separate from functions |
| Procedure HTTP default timeout 500 ms / max 10 s (2.0.1) | 30 s default, 180 s max (PR #4630, merged 2026-03-13) | since 2.0.5 | Always pass an explicit `TimeDuration` |
| `ctx.sender` empty in procedures (2.4-2.6.0) | correct since 2.6.1 | 2.6.1 | Still unknown for scheduled procedures; measured here |
| Scheduled functions submitted serially | submitted concurrently | 2.10.1 | Slow procedure no longer blocks other scheduled reducers by design; this is the claim being load-tested |
| OpenAI `response_format` json_schema wrapper | `output_config.format` json_schema, `additionalProperties:false`, no numeric/string constraints | Anthropic GA | Mapping in Example 4 |
| Sonnet `thinking: {type:'disabled'}` | Sonnet 5.5: `between_tools` (effort <= high, no other field) or adaptive at low effort | Sonnet 5.5 | Thinking-off variant composability is an open measurement |

**Deprecated/outdated:** `output_format` (use `output_config.format`); `budget_tokens`, `temperature/top_p/top_k` on Sonnet 5.5 (400); HTTP/2 for procedures (#6005 closed unmerged; HTTP/1.1 only, fine for Anthropic).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `Date.now()` inside a module is not a reliable wall clock, so call duration is derived from `tx.timestamp` pairs (record `Date.now()` only as a cross-check) | Pattern 2 | If it is reliable, extra precision only; if tx pairs are coarse, callMs is slightly overstated (includes two commits) |
| A2 | A Vitest "live" file can host a long-lived WebSocket client with the generated bindings on Node 22 (global `WebSocket`) | Standard Stack / Code Example 5 | Fall back to `tsx` (needs legitimacy gate + human-verify) or bundling; Wave 0 smoke test decides |
| A3 | The CLI token (`spacetimedb_token`) is accepted by the local server and yields identity `c200252497b9...` for `spacetime call` | Pitfall 5 | `spike_set_key` rejects; operator sees actual sender hex in logs and the gate constant is adjusted with user OK |
| A4 | Server debug logs and CLI error output do not echo reducer arguments | Pitfall 6 | Key leaks to logs; canary test in Wave 0 detects it before the real key is used |
| A5 | Token/cost estimates (skill call ~1.5K in / ~0.9-2K out; region ~1.2K in / ~2-4K out; new tokenizer) | Cost table | Budget differs; the in-module cap and `usage` accumulation bound it regardless |
| A6 | `ctx.timestamp` in a scheduled procedure is the actual start time (not the scheduled time), so `ctx.timestamp - arg.scheduledAt` is dispatch lateness | Pattern 2 | Lateness would read 0; cross-check with `tx1 - scheduledAt` (also recorded) |
| A7 | `thinking: {type:'between_tools'}` may or may not compose with `output_config.format` | Pitfall 8 | Accepted or a 400; either outcome is a recorded finding |
| A8 | Republishing a byte-identical module may not restart the instance | Pitfall 9 | If it does restart, the build-tag change is merely redundant |
| A9 | `https://example.com/` is an acceptable "public URL" for rung 1 | Code Example 3 | Substitute any public HTTPS host; verified reachable via curl this session |

## Open Questions

1. **Upstream vs platform failures in "every non-drill call succeeds".**
   - What we know: the locked gate is strict; Anthropic returns 429/529/5xx transiently.
   - What's unclear: whether the user wants one transient upstream 5xx to force no-go.
   - Recommendation: keep the strict verdict, but have the helper and record report `platformFailures` and `upstreamFailures` separately and flag upstream-only failures at the verdict-confirmation step (the user already confirms the verdict). Do not silently retry inside the harness.

2. **Noise floor on the 2x baseline ratios.**
   - What we know: idle baselines may be a few ms; 2x of that is inside jitter.
   - What's unclear: whether the user wants an absolute floor.
   - Recommendation: implement `noiseFloorMs` (default 0 = strict), run the baseline2 control, and show both strict and floor-adjusted verdicts (suggested floor 25 ms for ping, 50 ms for tick lateness, to be confirmed); the strict verdict is the decision of record unless the user says otherwise.

3. **Which schema for the thinking-off variant.**
   - Context says 3 runs; either schema qualifies.
   - Recommendation: skill schema at effort `medium` (cheap, and `medium` is where thinking cost shows). Add one region run only if it composes.

4. **Concurrency workload.**
   - Recommendation: region schema at effort `low`, 8 in flight x 3 rounds, because it holds the V8 pin long enough (10-25 s) to yield >= 50 tick samples and is the realistic worst case. If the first 8-round fails, step down to 4 then 2 (about $0.3 extra).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | harness, set-key runner | yes | v22.23.2 | — |
| pnpm | tests/installs | yes | 11.23.0 | — |
| SpacetimeDB CLI | publish/call/generate/logs/delete | yes | 2.10.1 | — |
| Local SpacetimeDB server (127.0.0.1:3000) | everything | not running now | CLI/runtime 2.10.1 | start with `spacetime start --non-interactive --listen-addr 127.0.0.1:3000` (run-local skill, background) |
| Vitest | helper tests + live harness | yes | 5.0.2 (root and `spacetimedb/`) | — |
| DNS to api.anthropic.com | all Claude rungs | yes | public 160.79.104.10 / 2607:6bc0::10 | — |
| Direct HTTPS to Anthropic | reference | yes | `curl` 401 (no key) in 0.38 s | — |
| Public URL (rung 1) | SPIKE-01 | yes | `https://example.com/` 200 in 0.8 s | `https://www.cloudflare.com/cdn-cgi/trace` (200 in 0.28 s) |
| `spacetimedb/.env.local` with ANTHROPIC_API_KEY | live rungs | **no (file absent)** | — | none: operator action (blocking) |
| Anthropic Console workspace "uwr-dev" + ~$10 spend limit | live rungs | unknown (operator) | — | none: operator action (blocking) |
| wrangler / workerd (llm-proxy) | hop baseline only | yes (`llm-proxy/node_modules`, `.dev.vars` present) | ^4.140.0 | skip the hop baseline (non-gate) |

**Missing dependencies with no fallback:** the API key file and workspace (a `checkpoint:human-action` before the first paid rung; free rungs 1, 2-without-key... note rung 2 needs the key too, so only rung 1, dispatch, tick, ping and canary tests can run before it arrives).
**Missing dependencies with fallback:** local server (start it).

## Cost Estimate (live spend, Sonnet 5.5 at $2 in / $10 out / $2.50 cache write / $0.20 cache read per MTok) [CITED: claude-api skill; STACK.md; token counts ASSUMED A5]

| Step | Calls | Per-call estimate | Total (typical / worst) |
|------|------:|-------------------|-------------------------|
| Rung 1 public URL, rung 2 `/v1/models` | 20 | free | $0 |
| Rung 3 minimal (max_tokens 64) | 30 | ~$0.0003 | $0.01 / $0.02 |
| Skill schema, low + medium (5 each) | 10 | $0.010-0.02 | $0.15 / $0.25 |
| Region schema, low + medium (5 each) | 10 | $0.025-0.06 | $0.35 / $0.60 |
| Thinking-off variant (skill, medium) | 3 | ~$0.015 | $0.05 / $0.08 |
| Concurrency: region `low` x 8 x 3 rounds | 24 | ~$0.025 | $0.60 / $0.90 |
| Step-down rounds (only if 8 fails): 4 and 2 in flight | 12 | ~$0.025 | $0 / $0.30 |
| Cache pair, timeout x2, bad key x2 (free), publish-survival, #4954 direct call | ~8 | $0.005-0.03 | $0.10 / $0.20 |
| Reruns / debugging headroom | ~15 | mixed | $0.20 / $0.40 |
| **Total** | | | **~$1.5 typical / ~$2.6 worst** |

Enforce with `spike_state.capMicroUsd` (default 2_500_000 micro-USD): tx1 refuses new calls once the accumulated `usage`-based estimate reaches the cap (overshoot bounded by 8 in-flight x ~$0.08 max). The workspace ~$10 limit is the outer fence. If the cap trips, stop and ask the user before raising it.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 |
| Config file | none in `spacetimedb/` (defaults; tests are `src/**/*.test.ts`); live harness uses `scripts/spike/vitest.spike.config.ts` (temporary) |
| Quick run command | `pnpm --dir spacetimedb exec vitest run src/helpers/measurement.test.ts` |
| Full suite command | `pnpm --dir spacetimedb test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SPIKE-04 | percentile math: nearest-rank (n=50, p95 -> 48th value), n=1, p0/p100, unsorted and duplicate inputs, empty throws, input not mutated | unit | `pnpm --dir spacetimedb exec vitest run src/helpers/measurement.test.ts -t percentile` | Wave 0 |
| SPIKE-04 | `evaluateGate`: all pass -> go; 8 fails/4 passes -> go_with_cap cap 4; only 2 passes -> cap 2 (min 2); 2 fails -> no_go; reliability failure -> no_go; dispatch p95 250 exactly fails/249 passes; region schema fail without workaround -> no_go, with workaround -> pass; sample minimums unmet -> incomplete; drills excluded from reliability; `noiseFloorMs` behavior | unit | `pnpm --dir spacetimedb exec vitest run src/helpers/measurement.test.ts -t gate` | Wave 0 |
| SPIKE-01 | Ladder complete: 10/10 public URL, 10/10 `/v1/models` (list contains `claude-sonnet-5-5`), 30/30 small calls; server logs excerpt saved | live + evidence | harness section `ladder` in `39-spike-results.json`; helper `evaluateGate` reliability check; record section "Server logs" | evidence (Wave 2) |
| SPIKE-02 | Structured matrix present: skill/region x low/medium x 5, thinking-off x 3 (accepted or recorded 400), drills x2 each with observed shape, headers visibility booleans, region compile result | live + evidence | `results.structured`, `results.drills`, `results.headers` populated (schema test, below) | evidence (Wave 2) |
| SPIKE-03 | Dispatch p95 over 50 no-ops; `ctx.sender` findings; baseline vs load8 ping and tick p95; memory snapshots | live + evidence | `results.dispatch`, `results.sender`, `results.load[]` populated; verdict recomputed | evidence (Wave 3) |
| SPIKE-04 | Results file is well-formed, contains no key material, and the recorded verdict equals `evaluateGate(recomputed from raw samples)` | unit (kept) | `pnpm --dir spacetimedb exec vitest run src/helpers/measurement.results.test.ts` (skips if results file absent) | Wave 0 (write against fixture, then real file) |
| SPIKE-04 | Decision logged | doc check | `grep -c "Decision" .planning/phases/39-procedure-to-claude-spike/39-SPIKE-RECORD.md` and `grep -n "Phase 39" .planning/PROJECT.md .planning/STATE.md` | Wave 4 |
| Cleanup | Production files reverted; no spike remnants | shell | `git diff <start-sha> --stat -- spacetimedb/src/index.ts spacetimedb/src/schema/tables.ts` (empty); `git grep -il spike -- spacetimedb/src` (empty); `pnpm --dir spacetimedb test`; `spacetime list` shows no uwr-spike | Wave 4 |

### Sampling Rate
- **Per task commit:** `pnpm --dir spacetimedb exec vitest run src/helpers/measurement.test.ts`
- **Per wave merge:** `pnpm --dir spacetimedb test` (full suite green) and, once the spike module exists, `spacetime build -p spacetimedb` (module compiles)
- **Phase gate:** full suite green, results JSON leak-scanned (no `sk-ant-` pattern, no key value), cleanup verification passes, then user confirms the verdict

### Wave 0 Gaps
- [ ] `spacetimedb/src/helpers/measurement.ts` + `measurement.test.ts` (pure; can be built and tested before any server exists)
- [ ] `spacetimedb/src/helpers/measurement.results.test.ts` (results schema, no-secrets scan, verdict reproducibility; skipped when the file is absent)
- [ ] Smoke checks (no spend): server up; `spike_whoami` identity equals the CLI constant; bindings generated; Vitest live file connects and pings; canary-key leak scan clean
- [ ] Framework install: none needed

## Security Domain

Security enforcement is enabled (config key absent). The surface is a local throwaway database plus one credential.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | limited | Only the key reducer is gated, by CLI identity constant; other spike reducers are open because `uwr-spike` is local (127.0.0.1) and throwaway |
| V3 Session Management | no | — |
| V4 Access Control | yes | `ctx.sender` identity check for `spike_set_key`; `llm_config` and job/state tables private; only result/tick tables public and free of secrets |
| V5 Input Validation | yes | `JSON.parse` of `specJson` inside try/catch; results strings redacted (`sk-ant-` pattern) and length-capped; model text never executed |
| V6 Cryptography | no | Do not hand-roll; TLS is the host's |
| V7 Error Handling and Logging | yes | Log only sender hex and key length; redact before any console/`spike_result` write; canary leak test over `spacetime logs`, server `data\logs`, harness stdout |
| V14 Configuration | yes | `.env.local` gitignored (`git check-ignore -v spacetimedb/.env.local` verified); dedicated workspace with spend limit; scripts hard-code `uwr-spike` and refuse `maincloud` |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Key in shell history | Information disclosure | Runner reads `.env.local`, `spawnSync` with `shell:false`; operator never types the key |
| Key echoed in server/CLI logs or results | Information disclosure | Canary test first; `redact()`; `assertNoSecrets` on every results write; final `git grep sk-ant` and log grep |
| Key transient in process argv | Information disclosure | Accepted on a single-user dev machine; documented; use of the dedicated low-limit workspace bounds blast radius |
| Runaway spend (self-rescheduling bug, loop) | Denial of service (cost) | In-module cap from real `usage`, no self-rescheduling procedures (only the 1 s tick reducer, which makes no HTTP), workspace limit |
| Accidental production publish / maincloud | Tampering | Hard-coded DB name and server in scripts, `--no-config`, revert verification, memory rule (Claude never publishes to maincloud) |
| Leaving spike tables/reducers in `uwr` | Tampering | Pattern 5 verification; no `pnpm spacetime:publish` during the phase |

## Sources

### Primary (HIGH confidence)
- Installed `spacetimedb@2.10.1`: `dist/server/procedures.d.ts`, `http_internal.d.ts`, `http_shared.d.ts`, `reducers.d.ts`, `index.d.ts`, `lib/table.d.ts`, `lib/table_schema.d.ts`, `lib/time_duration.d.ts`, and runtime `dist/server/index.mjs` (`fetch`, `makeProcedureExport`, `ProcedureCtxImpl`, `runWithTx`, `resolveSchedules`); `dist/sdk/*.d.ts` (`Promise<void>` reducer calls, subscription builder), `dist/sdk/index.mjs` (global `WebSocket` resolution)
- Repo: `spacetimedb/src/index.ts` (`_wrapMethod`, registration order), `schema/tables.ts` (`schema({...})`, `LlmConfig`, scheduled tables), `data/llm_prompts.ts`, `data/combat_constants.ts`, `helpers/combat.ts:1487` (tick self-scheduling), `data/admin.ts`, `reducers/llm.ts`, `llm-proxy/src/index.ts`, `llm-proxy/scripts/smoke.sh`, `spacetime.json`, `spacetime.local.json`, `.gitignore`
- claude-api skill (bundled): model table and pricing, Sonnet 5.5 `between_tools` rules, structured-output schema limits, prompt-caching minimums (512 tokens), error/header notes
- CLI `--help` output for `call`, `delete`, `generate`, `logs`, `sql`, `publish` (2.10.1), `spacetime login show` identity, `cli.toml` structure (values redacted)
- Local environment probes run this session: `nslookup`, `curl` to api.anthropic.com / example.com, `data/config.toml`, Node/pnpm/spacetime/vitest versions

### Secondary (MEDIUM confidence)
- https://spacetimedb.com/docs/functions/procedures/ : `TimeDuration` import from the main package; timeout and network failure throw; `withTx` may run multiple times (page did not cover `onSchedule`)
- https://github.com/clockworklabs/SpacetimeDB/issues/4954 (closed; fixing version not shown) and #4697 (open; V8 thread parking, pool never shrinks)
- `.planning/research/STACK.md`, `ARCHITECTURE.md`, `PITFALLS.md`, `SUMMARY.md` (milestone research this phase builds on)

### Tertiary (LOW confidence)
- Behavior of Windows timer granularity on harness pacing; expected idle baseline magnitudes (unmeasured)

## Metadata

**Confidence breakdown:**
- Standard stack / API surface: HIGH - read from installed typings and runtime source
- Architecture (spike module, harness, revert): HIGH for structure, MEDIUM for harness runner (Vitest as runner is a Wave 0 smoke)
- Pitfalls: MEDIUM-HIGH - platform issue statuses partially unconfirmed (#4954 fix version)
- Cost estimate: MEDIUM - token counts assumed, spend bounded by an in-module cap

**Research date:** 2026-09-29
**Valid until:** 2026-10-13 (fast-moving: SpacetimeDB 2.10.x patch releases and Sonnet 5.5 behavior)
