# Technology Stack

**Project:** UWR v2.2 LLM — Claude Engine
**Researched:** 2026-09-29
**Scope:** Only what is NEW for the OpenAI-to-Claude migration and the latency goal. The SpacetimeDB backbone, auth, narrative UI and generation features are validated and not re-researched.

## Verdict

**No new npm dependencies for the primary path.** A SpacetimeDB 2.10.1 TypeScript procedure can call `https://api.anthropic.com/v1/messages` with `ctx.http.fetch` and plain `fetch`-style options. The Anthropic SDK is not needed and would not work there anyway. The API key lives in the private `llm_config` table that already exists. The whole change is one new helper module, one procedure bound to a schedule table, and deletion of `llm-proxy/`, `useLlmProxy.ts` and the localStorage secret.

Three facts shape the design and were not in the milestone brief:

1. **Procedures cannot stream.** `ctx.http.fetch` is synchronous and returns a fully buffered `SyncResponse` (`text()`, `json()`, `bytes()`, `arrayBuffer()` only). There is no SSE consumption or relay from a procedure. Streaming is only possible from a separate backend that talks to the browser directly. For this game that costs little: the structured-JSON domains (character, world, skills, renown) cannot be shown partially anyway, and the plain-text domains (NPC chat, combat narration) are short Haiku outputs already animated by the typewriter.
2. **TypeScript modules run in V8, and a blocking `fetch` parks a whole V8 worker thread** for the length of the call (up to 30 s default, 180 s max). The instance pool grows under concurrent blocked calls and never shrinks ([SpacetimeDB #4697](https://github.com/clockworklabs/SpacetimeDB/issues/4697), open). The milestone brief calls this a "WASM procedure"; for TS modules it is not. Design consequence: cap concurrent in-flight LLM calls, keep timeouts tight, and load-test alongside the combat tick reducers.
3. **Sonnet 5.5 thinks by default.** With `thinking` omitted it runs adaptive thinking at effort `high`, which adds time before the first visible token. Set `output_config.effort` explicitly (start at `low`). Haiku 4.5 does the opposite: no thinking unless enabled, and it **rejects** `output_config.effort`. One request builder must branch per model.

---

## Recommended Stack

### Core: LLM provider and models

| Technology | Version / ID | Purpose | Why |
|------------|--------------|---------|-----|
| Anthropic Messages API | `POST https://api.anthropic.com/v1/messages`, header `anthropic-version: 2023-06-01` | All LLM calls, raw HTTP from a procedure | Single stable endpoint; structured outputs, caching, effort all GA with no `anthropic-beta` header. No SDK is usable inside a SpacetimeDB module. |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | Character creation, world generation (replaces gpt-5.4) | Active, retirement not sooner than 2027-09-28. $2 in / $10 out per MTok, cache read $0.20, 1M context, 128K max output. |
| Claude Haiku 4.5 | `claude-haiku-4-5` (alias) or `claude-haiku-4-5-20251001` | Skills, NPC chat, combat narration, renown (replaces gpt-5-mini) | Fastest current model. $1 in / $5 out per MTok, cache read $0.10, 200K context, 64K max output. **Retirement "not sooner than 2026-10-15"** (see risk below). |

**Haiku 4.5 retirement risk.** The deprecations page lists Haiku 4.5 as Active with a tentative retirement of "not sooner than October 15, 2026", about two weeks out. No deprecation notice exists, and Anthropic promises at least 60 days' notice before retiring a public model. Do not hardcode model IDs in six places again. Put both IDs in one constants module (`spacetimedb/src/data/llm_models.ts`) with a role mapping (`FAST`, `QUALITY`), so a forced move to Sonnet 5.5 at `effort: low` is a one-line change. Confidence HIGH (official page, fetched today).

### Request recipe (raw HTTP, what the procedure sends)

Headers: `content-type: application/json`, `x-api-key: <key>`, `anthropic-version: 2023-06-01`. (`Authorization: Bearer <key>` is also accepted; the docs call `x-api-key` legacy but supported. Use `x-api-key`; it is what every example and the skill use.) No `anthropic-beta` header is required for anything recommended here.

```jsonc
// Sonnet 5.5, structured, quality path
{
  "model": "claude-sonnet-5-5",
  "max_tokens": 4096,                       // REQUIRED by Claude (the OpenAI proxy never sent it). Thinking counts toward it.
  "system": [{ "type": "text", "text": "<stable narrator + vocabulary + schema prose>",
               "cache_control": { "type": "ephemeral" } }],
  "messages": [{ "role": "user", "content": "<volatile per-request context>" }],
  "output_config": {
    "effort": "low",                        // low|medium|high|xhigh|max; default is high => slower. Sweep low/medium.
    "format": { "type": "json_schema", "schema": { /* see mapping below */ } }
  }
}
// Haiku 4.5: identical shape, but OMIT output_config.effort (400 on Haiku 4.5). Keep output_config.format.
// Do NOT send temperature/top_p/top_k to Sonnet 5.5 (non-default values 400).
```

Rules that will otherwise bite in the spike:

- **Response parsing:** iterate `content[]` and take the first block with `type === "text"`. With adaptive thinking a `thinking` block (empty text under the default `display: "omitted"`) can come first. Never read `content[0].text`. With `output_config.format`, the text block is the JSON string; still `JSON.parse` in try/catch.
- **Always check `stop_reason`** before trusting the body: `max_tokens` means truncated (invalid JSON possible), `refusal` means schema is not guaranteed (Sonnet 5.5 refuses in five `stop_details` categories: cyber, bio, frontier_llm, reasoning_extraction, general_harms). Map both to the existing graceful-degradation error path ("The Keeper is silent").
- **Usage:** read `usage.input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`. `input_tokens` counts only tokens after the last cache breakpoint.
- **Errors:** body is `{type:"error", error:{type, message}}`; 429 carries `retry-after`; a monthly spend-cap 429 has `error.details.error_code: "enforced_spend_limit_reached"` and no `retry-after` (do not retry it); a user-set spend limit returns 400 instead. 5xx/529 are retryable.
- **Forced tool use is a 400 on Sonnet 5.5; assistant prefill is a 400.** Use `output_config.format` for JSON, not tool_choice tricks or prefill.

### Structured outputs: mapping the existing OpenAI schemas

The current schema in `spacetimedb/src/data/llm_prompts.ts` (`buildSkillGenResponseFormat`) is OpenAI-shaped: `{type:'json_schema', json_schema:{name, strict, schema}}`. Mapping rules for Claude (`output_config.format`):

| OpenAI shape | Claude shape |
|--------------|--------------|
| `response_format: { type:'json_schema', json_schema:{ name, strict:true, schema } }` | `output_config: { format: { type:'json_schema', schema } }` (drop `name` and `strict`) |
| `type: ['number','null']` | `anyOf: [{type:'number'},{type:'null'}]` (docs show `anyOf` and `null` as supported; a type array is undocumented, so do not rely on it) |
| every object needs `additionalProperties:false` | same requirement (already satisfied in the repo's schema) |
| `enum`, `description`, `required` | supported |
| `minimum`/`maximum`/`minLength`/`maxLength`/`pattern`, `additionalProperties:true`, recursive schemas, external `$ref` | **unsupported**; enforce in server-side validation instead (the repo already validates skills and power budget) |

Operational notes: the first request with a new schema pays a one-time grammar-compile latency, cached 24 hours from last use, so schema churn costs latency and a warm-up call after publish is worthwhile. Structured outputs add an automatic system prompt (a few tokens) and changing `output_config.format` invalidates the prompt cache for that prefix. That means cache entries are effectively per (model, schema). Exact schema-complexity limits are not published; a "schema too complex" 400 means contact support. The repo's skill schema (15 required fields, 27-value enum, nullable unions) is the most complex one and should be the first schema tested.

### Prompt caching

Use explicit `cache_control: {type:"ephemeral"}` on the last system block (stable prefix), volatile context in the user message after it. Or top-level `cache_control` for auto-placement (works for the simple single-turn case).

| Model | Min cacheable prefix | Cache write (5 min) | Cache read | Consequence here |
|-------|----------------------|---------------------|------------|------------------|
| Sonnet 5.5 | 512 tokens | $2.50/MTok | $0.20/MTok | Narrator preamble + vocabulary + schema prose will cache. |
| Haiku 4.5 | **4096 tokens** | $1.25/MTok | $0.10/MTok | Current Haiku prompts are probably below the minimum and silently will not cache (no error, `cache_creation_input_tokens: 0`). Either accept no caching on Haiku, or build one shared, byte-stable Keeper prefix of at least 4096 tokens. Measure with the free `POST /v1/messages/count_tokens` before deciding. |

Default TTL is 5 minutes, refreshed free on each hit; 1 hour costs 2x to write. In a low-traffic game a 5-minute cache is often cold, so caching is mainly a cost lever, and a latency lever only for large prefixes. A cache entry is usable only after the first response begins, so concurrent identical calls do not share it. Cached reads do not count toward ITPM. Verify with `usage.cache_read_input_tokens`; a zero across repeats means a silent invalidator (a timestamp, unsorted JSON keys, a varying tool list).

### Effort and thinking per model (latency lever)

| Model | Setting | Notes |
|-------|---------|-------|
| Sonnet 5.5 | `output_config.effort: "low"` first; try `medium` where quality lacks | From `medium` up it thinks briefly before almost every reply, adding to time-to-first-token; at `low` it skips thinking on most simple requests. Levels are recalibrated versus Sonnet 5, so sweep on real prompts. |
| Sonnet 5.5 (thinking-off route) | `thinking: {type:"between_tools"}` with effort `high` or below | The only way to turn thinking off; `{type:"disabled"}` is a 400. Accepts no other field inside `thinking`. Sonnet 5.5 only. Try adaptive at `low` first. Not yet verified in combination with `output_config.format`; test in the spike. |
| Sonnet 5.5 | never send `budget_tokens`, `temperature`, `top_p`, `top_k` | 400. |
| Haiku 4.5 | no `thinking`, no `effort` | Extended thinking would need `budget_tokens`; not wanted for latency. `temperature` is allowed. |
| Both | keep `max_tokens` as tight as the domain allows | Output tokens dominate latency. Combat narration 400, NPC 500, skills 1500 are reasonable; raise Sonnet limits above the old 1024/2048 to leave room for thinking, and alert on `stop_reason: "max_tokens"`. |

Not applicable: fast mode (Opus only), Priority Tier (not supported on Sonnet 5.5), Batch API (asynchronous, wrong for interactive), task budgets (agentic loops only).

### Pricing and rate limits (for budget recalibration)

| | Sonnet 5.5 | Haiku 4.5 |
|---|-----------|-----------|
| Input / Output per MTok | $2 / $10 | $1 / $5 |
| Cache write 5m / 1h | $2.50 / $4 | $1.25 / $2 |
| Cache read | $0.20 | $0.10 |
| Start tier RPM / ITPM / OTPM | 1,000 / 2M / 400K | 1,000 / 2M / 400K |
| Build tier | 5,000 / 5M / 1M | 5,000 / 5M / 1M |
| Own rate-limit pool | yes (separate from Sonnet 5 and 4.x) | yes |

Worked estimates (illustrative token counts, measure real ones): a Haiku call at 3K in / 500 out is about $0.0055; a Sonnet 5.5 call at 4K in / 1.5K out is about $0.023, roughly 4x. The current budget (`DAILY_LLM_BUDGET = 50` calls per player per day, in `helpers/llm.ts`) counts calls, not cost, so an all-Sonnet day is about $1.15 per player versus about $0.28 all-Haiku. Recommend recording per-call `usage` and model in a private table and moving to a cost-weighted budget (micro-dollars computed from a constants table). Sonnet 5.5 and 4.7+ models use a newer tokenizer (about 30% more tokens for the same text than pre-4.7 models); Haiku 4.5 uses the older one, so re-baseline prompt sizes with `count_tokens`, not with OpenAI token estimates. Spend caps: Start tier $500/month, Build $1,000/month; hitting the cap stops all calls until the 1st. Set a lower self-imposed workspace limit in the Console.

### SpacetimeDB 2.10.x procedure surface (verified against installed typings in `spacetimedb/node_modules/spacetimedb` 2.10.1)

| Item | Fact | Confidence |
|------|------|------------|
| Definition | `spacetimedb.procedure(opts?, params, returnType, (ctx, args) => ret)`. The repo's `_wrapMethod('procedure', ...)` in `index.ts` already handles the 4-arg form with `{ name }`; pass an explicit `name` so the export map gets a stable key. | HIGH (typings + repo) |
| HTTP | `ctx.http.fetch(url, { method, headers, body, timeout })` returns `SyncResponse` synchronously. `body`: string or ArrayBuffer/view. `headers`: object, tuple array or `Headers`. `timeout`: `TimeDuration` (`TimeDuration.fromMillis(n)`), default 30 s, clamped to 180 s (PR #4630, merged 2026-03-13; was 500 ms default / 10 s max in 2.0.1). | HIGH |
| Response | `.status`, `.ok`, `.statusText`, `.headers`, `.url`, `.version`, `.text()`, `.json()`, `.bytes()`, `.arrayBuffer()`. No streaming reader. Wrap `fetch` in try/catch; network errors and timeouts should be treated as throwing (exact failure shape not documented; verify in spike). | HIGH (typings) / MEDIUM (throw behavior) |
| Limits | Loopback/private IPs blocked (#4546), so a local proxy at `localhost:8787` is unreachable from a procedure by design; api.anthropic.com is public and fine. HTTP is HTTP/1.1 only (HTTP/2 PR #6005 was closed unmerged on 2026-09-29, re-split as draft #6012). No documented body-size limit. | MEDIUM |
| Transactions | Procedures have no `ctx.db`. Use `ctx.withTx(tx => { tx.db.table... })`. Cannot hold a transaction open across `fetch`. Pattern: `withTx` (read key, mark task processing) then `fetch` then `withTx` (write result, usage, delete task). | HIGH (docs + repo CLAUDE.md) |
| Return value | Returns only to the calling client (`conn.procedures.x({...})` gives a Promise); never broadcast. Clients see results only through table subscriptions. | HIGH |
| Scheduling | A procedure returning `t.unit()` can be bound to a schedule table with `spacetimedb.procedure({ name, onSchedule: table }, {arg: Table.rowType}, t.unit(), ...)`. The legacy `scheduled: () => procedureExport` table option also accepts procedures in 2.10.1 typings (deprecated in favour of `onSchedule`). A schedule table binds to at most one function. **Scheduled procedures delete the row before running** (a scheduled reducer deletes it after), so `find`/`update` on that row inside the procedure fails; pass everything in the row and the arg. | HIGH |
| Concurrency | Since 2.10.1 scheduled functions are submitted concurrently (a slow LLM procedure no longer blocks other scheduled reducers such as `combat_loop`), and overdue jobs no longer run in strict `scheduled_at` order. | HIGH |
| V8 blocking | A blocking `fetch` parks one V8 worker for the whole call, extra instances are created on demand and never shrink (#4697, open). Ten concurrent 30-60 s calls imply 10+ blocked instances with their memory. Haiku-scale calls (1-4 s) make this a non-issue; long Sonnet calls under load are the risk. | MEDIUM (issue text, not measured) |
| `ctx.sender` | Correct inside procedures since 2.6.1. | HIGH (repo notes) |

### Secret storage (Anthropic API key)

Use the existing private singleton `llm_config` (`id=1`, `apiKey`), set by the admin-only `set_api_key` reducer in `reducers/llm.ts`. It is already private (no `public: true`), which the SpacetimeDB docs recommend for API keys; clients cannot query or subscribe to it. Read it inside the first `withTx`, then use it outside the transaction for `fetch`. There is no module environment-variable or secrets facility in SpacetimeDB; do not invent one. Two caveats: the docs do not say whether the database owner can read private tables (assume yes, via the CLI), and the key sits in hosted maincloud storage, so limit blast radius: create a **dedicated workspace** in the Claude Console with a workspace spend limit and rate limits, and a **service-account-linked key scoped to that workspace with an expiration** (workspace keys are legacy). Rotate by calling `set_api_key` again; never log the key, never echo it in `fail()` messages. Set it via `spacetime call`, and remember the argument lands in shell history (read from an env var).

### Integration blueprint (direct-first path)

| Change | Where | Notes |
|--------|-------|-------|
| `helpers/anthropic.ts` (new) | `spacetimedb/src/helpers/` | Pure functions: `buildMessagesRequest(task)` returns `{url, headers, body}`; `parseMessagesResponse(status, json)` returns `{ok, text, usage, stopReason, errorKind}`. Pure so Vitest can cover them with no runtime (project rule: new work ships unit tests). |
| `data/llm_models.ts` (new) | `spacetimedb/src/data/` | Model IDs, per-model capability flags (`supportsEffort`), pricing constants, timeouts, `maxTokens` defaults. Replaces the six hardcoded `'gpt-5.4'`/`'gpt-5-mini'` literals (`index.ts` x4, `combat_narration.ts`, `renown.ts`, `npc_interaction.ts`) and the `validModels` list in `reducers/llm.ts`. |
| `LlmTask` becomes a schedule table | `schema/tables.ts` | Add `scheduledId`/`scheduledAt`, keep it **private** (today it is `public: true` and ships prompts to every client). Reducers keep writing the row exactly as they do now; insert with `ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch)` to run immediately. Remember the repo gotcha: scheduled tables key on `scheduledId`. |
| `run_llm_task` procedure (new) | `spacetimedb/src/index.ts` or `reducers/llm.ts` | `onSchedule: LlmTask`, returns `t.unit()`. Reads key, calls Claude, then applies the result through the same code path `submit_llm_result` uses today (extract that body into a shared function called from `withTx`). |
| Retire | `llm-proxy/`, `src/composables/useLlmProxy.ts`, `submit_llm_result` client path, `localStorage.llm_proxy_secret`, `VITE_LLM_PROXY_*`, `openai` dependency | The `sweep_llm_errors` scheduled reducer stays as the watchdog for tasks lost when a procedure traps after its row was deleted. |
| Client | Vue | No LLM code remains; the client just subscribes to result tables (existing `useTable`). |

### Spike acceptance criteria (first phase; decides direct vs fallback)

Run against local `spacetime start` first (the 2.0.1 failure was local), then maincloud manually (never auto-publish to maincloud):

1. `GET https://api.anthropic.com/v1/models` with `x-api-key` from a procedure. Zero token cost; proves TLS, DNS, auth, timeout handling locally.
2. Haiku call, `max_tokens: 16`, then one with `output_config.format` using the skill schema. Record wall time and `usage`.
3. Sonnet 5.5 call at `effort: low` and `medium` with the character-creation schema; record time, `stop_reason`, thinking blocks present or not.
4. Force a timeout (`TimeDuration.fromMillis(50)`) and a bad key; confirm the failure shape and that the error path reaches the player as a `fail()`-style message.
5. Concurrency: 10 simultaneous scheduled `run_llm_task` calls while `combat_loop` ticks run; measure reducer latency and V8 instance/memory growth.
6. Same-prefix repeat calls: confirm `cache_read_input_tokens > 0` for Sonnet and learn whether the Haiku prompts hit the 4096 floor.

Direct path is a **go** if steps 1-3 succeed locally and on maincloud, and step 5 shows no combat-tick regression at the expected player count. Otherwise use the fallback below.

---

## Fallback path: backend LLM service with Workload Identity Federation

Only build this if the spike fails.

### How WIF works (verified against official docs)

Three Console resources: a **service account** (`svac_...`), a **federation issuer** (`fdis_...`, an OIDC provider URL plus JWKS source), and a **federation rule** (`fdrl_...`, match conditions on `sub`/`aud`/claims/CEL mapped to a service account, an OAuth scope, and a token lifetime of 60-86400 s). The workload presents a signed OIDC JWT to `POST /v1/oauth/token` (RFC 7523 `jwt-bearer` grant) and gets a short-lived `sk-ant-oat01-...` access token; the SDK refreshes it automatically. Use scope `workspace:inference` (Messages, Models, chat only) rather than `workspace:developer`. The JWT must use an asymmetric algorithm, carry `kid`, `sub`, `iat`, `exp`, and (if it has a `jti`) can be exchanged only once. The SDK activates WIF when `ANTHROPIC_FEDERATION_RULE_ID`, `ANTHROPIC_ORGANIZATION_ID`, `ANTHROPIC_SERVICE_ACCOUNT_ID` and `ANTHROPIC_IDENTITY_TOKEN(_FILE)` are set, and a stray `ANTHROPIC_API_KEY` (even empty) silently wins over federation.

### Which runtimes can obtain an OIDC token

| Runtime | Ambient OIDC token? | WIF verdict |
|---------|--------------------|-------------|
| **Google Cloud Run / Cloud Functions / GCE / GKE** | Yes: metadata server returns a Google-signed identity token (`iss https://accounts.google.com`, requested with `audience=https://api.anthropic.com&format=full`) | **Recommended fallback host.** Turnkey, documented, scale-to-zero. |
| AWS (EKS IRSA, STS web identity) / Azure (IMDS, Entra) / GitHub Actions / Kubernetes | Yes | Supported but adds a cloud the project does not use. |
| **Cloudflare Workers** (today's `llm-proxy` host) | **No.** Workers have no ambient outbound workload identity; a request for Cloudflare-issued JWTs is only a community feature request. Cloudflare docs cover Workers as *consumers* of OIDC tokens. | Cannot do real WIF. Minting your own JWT in a Worker with a private key in a Wrangler secret just swaps one static secret for another. If Workers is kept, use an API key as a Wrangler secret. |
| **SpacetimeDB procedure** | No | Cannot obtain or sign a token in any meaningful way. Do not try (see What NOT to add). |

### Fallback shape (keeps the procedure design, swaps the target)

Keep `run_llm_task` and the schedule table exactly as in the primary path, but point `ctx.http.fetch` at a small backend on Cloud Run (public HTTPS) instead of api.anthropic.com. The procedure authenticates to the backend with a shared bearer secret held in `llm_config` (a *service* secret, never in the browser). The backend holds no Anthropic key; it uses WIF and returns `{text, usage, stopReason}` synchronously. This preserves the no-browser-credentials goal and removes the client polling hop even in the fallback, and the procedure and response-parsing code stay nearly identical. Cloud Run notes: Node 22, `min-instances=1` to avoid cold starts on the hot path, region close to Anthropic-US and to the SpacetimeDB host.

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@anthropic-ai/sdk` | `^0.129.0` (npm latest 0.129.0, modified 2026-09-28) | Backend only (Cloud Run or Worker) | Typed client, retries, streaming helpers, WIF via `oidcFederationProvider`. Never inside SpacetimeDB. |
| WIF imports | `@anthropic-ai/sdk/lib/credentials/oidc-federation` (`oidcFederationProvider`) | Cloud Run identity-token provider | Pass `identityTokenProvider` that fetches the metadata-server token; SDK does exchange and refresh. |
| Node | `>=22.12` | Runtime | Already the repo floor. |
| Hono | `^4.13` (repo has `^4.13.0`, latest 4.13.11) | Thin HTTP layer on Cloud Run or Workers | Already in use; no new framework. |
| `wrangler` | `^4.143` (latest 4.143.1) | Only if a Worker is retained | Already in use. |
| `google-auth-library` | do not add | n/a | A plain `fetch` to the metadata server (three lines) is enough, per the official example. |

Streaming, if ever wanted, belongs only in this backend, with the browser connecting to it directly over SSE and authenticating with its SpacetimeAuth token (verified server-side against the OIDC JWKS). That reintroduces a browser-to-service hop and JWT verification code, so defer it unless the latency measured in the spike is unacceptable for NPC chat.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| LLM call site | SpacetimeDB scheduled procedure, `ctx.http.fetch` to Anthropic | Keep Worker proxy, swap OpenAI SDK for Anthropic | Keeps 2 extra network hops, a browser-held secret, the polling composable, and a second deploy. Only a fallback. |
| Trigger | Reducer inserts a schedule row, scheduled procedure runs | Client calls the procedure directly (`conn.procedures.x`) | Server-triggered calls (combat narration, renown, NPC) have no client to call it; result would go only to that caller; a disconnected client loses the call. Direct client calls are fine only for a one-off spike. |
| Streaming | None (typewriter over completed text) | SSE from a backend to the browser | Procedures cannot relay SSE; JSON domains cannot display partial output; adds auth surface. Revisit only if measured NPC-chat latency fails. |
| Anthropic client | Raw `fetch` shape inside a pure helper | `@anthropic-ai/sdk` in the module | The SDK cannot run in the SpacetimeDB V8 module (no Node/`fetch` globals as the SDK expects, sync-only HTTP). |
| Secret | Private `llm_config` row | Hardcode in module source, or public table | Source is published and versioned; a public table leaks to every client. |
| Auth to Anthropic | Scoped service-account API key with spend limit | WIF from the procedure | A WASM/V8 procedure has no ambient identity and would have to hold a signing key, which is the same secret in another form. |
| Fallback host | Cloud Run + WIF | Cloudflare Worker + WIF | Workers cannot obtain an OIDC token. Worker + API key secret is the last-resort fallback. |
| Cheap model | Haiku 4.5, centralised ID | Sonnet 5.5 at `low` effort everywhere | Worth a measured comparison (one model means one cache namespace, and Haiku is due for retirement review), but Sonnet is ~2x the price and the Haiku speed advantage is the point. Keep the constants module so this is switchable. |
| Refusal handling | Treat `stop_reason: "refusal"` as an error path | Server-side `fallbacks` beta (`server-side-fallback-2026-07-01`) | Adds a beta header and a fallback model; does not retry `bio`, `reasoning_extraction` or `general_harms` declines, the likelier fantasy-violence category. Revisit if refusals are observed. |

## What NOT to Add

- **`@anthropic-ai/sdk` or `openai` inside `spacetimedb/`.** Cannot run there. Also remove `openai` from `llm-proxy/` when that directory is deleted.
- **A "custom OIDC issuer" in the module** (SpacetimeDB now supports inbound HTTP handlers, so it could serve JWKS). It would sign with a key stored in the same database, adding complexity with zero security gain over the scoped API key.
- **WIF inside SpacetimeDB or Cloudflare Workers.** Neither can obtain a workload identity token.
- **Streaming plumbing** (SSE parsers, a Durable Object relay, a WebSocket to the Worker). Out of Scope item stays out unless the spike proves latency inadequate.
- **`anthropic-beta` headers, `fallbacks`, task budgets, compaction, context editing, fast mode, Batch API, Managed Agents, tool use.** None serve single-turn generation with structured JSON.
- **A retry loop with sleep inside the procedure.** Modules have no timers; a hot retry loop pins a V8 worker. Retry (429/5xx) by re-inserting a schedule row with `ScheduleAt.time(now + backoff)`, capped at 1-2 attempts; otherwise degrade gracefully.
- **New client libraries.** The client already has everything (`useTable`, reducers). The Vue `useProcedure` composable exists in 2.10 but is unnecessary for the scheduled-procedure design.
- **`google-auth-library`, `jose`, or any JWT library** in the fallback backend; the SDK plus one metadata `fetch` covers WIF.

## Installation

```bash
# Primary path: nothing to install.
# spacetimedb/ stays on "spacetimedb": "^2.10.1" (2.10.2 exists on npm as of 2026-09-28;
# release notes were not retrievable. Bump CLI and package together only after the spike, if at all.)

# Removed when llm-proxy/ is retired
#   rm -r llm-proxy   (drops hono, openai, wrangler, workers-types with it)

# Fallback path only (new backend project, pnpm like the rest)
pnpm add @anthropic-ai/sdk@^0.129.0 hono@^4.13
pnpm add -D typescript vitest
```

Set the key (local publish is automatic, maincloud is manual only):

```bash
spacetime publish uwr -p spacetimedb              # local; no --clear-database (LlmTask gains columns: check whether the schema change requires it)
spacetime call uwr set_api_key "\"$ANTHROPIC_API_KEY\""
```

Schema note: converting `llm_task` to a schedule table changes its columns, which may require `--clear-database` per the project rule; decide during phase planning, not here.

## Confidence

| Claim area | Level | Basis |
|------------|-------|-------|
| Model IDs, pricing, rate limits, retirement dates | HIGH | Official pricing, models, rate-limit and deprecation pages fetched 2026-09-29; claude-api skill |
| Messages API shape, `output_config.format`, effort/thinking rules, caching minimums | HIGH | Official docs plus skill migration guide |
| `ctx.http.fetch` surface, `withTx`, scheduled procedures, timeout defaults | HIGH | Installed 2.10.1 `.d.ts` files, official docs, PR #4630 |
| V8 blocking and concurrency behaviour | MEDIUM | GitHub issue #4697 text; not measured; spike step 5 |
| Procedure HTTP throw/error semantics, body-size limits | LOW | Not documented; spike steps 1 and 4 |
| Sonnet 5.5 `between_tools` combined with `output_config.format` | LOW | Each is documented separately, the combination is not |
| Owner can read private tables | LOW-MEDIUM | Docs silent; assume yes |
| Cloudflare Workers lacking workload identity | MEDIUM | Web search and community request; no official statement found |
| WIF mechanics and Cloud Run path | HIGH | Official WIF, authentication, reference and GCP provider pages |

## Sources

- Anthropic pricing: https://platform.claude.com/docs/en/about-claude/pricing (HIGH)
- Anthropic models overview: https://platform.claude.com/docs/en/models/overview (HIGH)
- Anthropic model deprecations: https://platform.claude.com/docs/en/about-claude/model-deprecations (HIGH)
- Anthropic rate limits: https://platform.claude.com/docs/en/api/rate-limits (HIGH)
- Anthropic structured outputs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs (HIGH)
- Anthropic prompt caching: https://platform.claude.com/docs/en/build-with-claude/prompt-caching (HIGH)
- Anthropic streaming: https://platform.claude.com/docs/en/build-with-claude/streaming (HIGH)
- Anthropic authentication: https://platform.claude.com/docs/en/manage-claude/authentication (HIGH)
- Anthropic Workload Identity Federation, reference and GCP provider: https://platform.claude.com/docs/en/manage-claude/workload-identity-federation , https://platform.claude.com/docs/en/manage-claude/wif-reference , https://platform.claude.com/docs/en/manage-claude/wif-providers/gcp (HIGH)
- claude-api skill (`shared/model-migration.md` Migrating to Claude Sonnet 5.5, `shared/prompt-caching.md`, `shared/tool-use-concepts.md`) (HIGH)
- SpacetimeDB procedures docs: https://spacetimedb.com/docs/functions/procedures (HIGH)
- SpacetimeDB schedule tables: https://spacetimedb.com/docs/tables/schedule-tables (HIGH)
- SpacetimeDB table access permissions: https://spacetimedb.com/docs/tables/access-permissions (MEDIUM)
- SpacetimeDB PR #4630 (timeouts): https://github.com/clockworklabs/SpacetimeDB/pull/4630 (HIGH)
- SpacetimeDB issue #4697 (V8 blocking fetch): https://github.com/clockworklabs/SpacetimeDB/issues/4697 (MEDIUM)
- SpacetimeDB PR #6005 (HTTP/2, closed): https://github.com/clockworklabs/SpacetimeDB/pull/6005 (MEDIUM)
- SpacetimeDB v2.10.x release notes (scheduler concurrency): https://github.com/clockworklabs/SpacetimeDB/releases/tag/v2.10.1 (MEDIUM, via search summary)
- Installed typings: `spacetimedb/node_modules/spacetimedb/dist/server/{procedures,http_internal,http_shared}.d.ts`, `dist/lib/table.d.ts` (HIGH)
- Cloudflare Workers OIDC feature request: https://community.cloudflare.com/t/jwt-oidc-token-in-workers/783167 (LOW-MEDIUM)
- npm registry: `@anthropic-ai/sdk` 0.129.0, `hono` 4.13.11, `wrangler` 4.143.1, `spacetimedb` 2.10.2 (HIGH, queried 2026-09-29)
