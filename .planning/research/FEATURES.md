# Feature Research

**Domain:** Low-latency LLM narrative engine for a real-time multiplayer web RPG (migration OpenAI -> Anthropic Claude), milestone v2.2 "LLM - Claude Engine"
**Researched:** 2026-09-29
**Confidence:** MEDIUM overall. Claude API facts (models, pricing, caching minimums, structured-output limits, error codes, refusal behavior) are HIGH (claude-api skill, cached 2026-09-25). SpacetimeDB procedure behavior is MEDIUM (docs/issues search). Latency numbers and player-experience thresholds are LOW-MEDIUM: they are targets, not measurements. The first live smoke test must replace them with real numbers.

Scope: only what the NEW capabilities need. Existing v2.0/v2.1 features (creation flow, world gen, skills, NPC chat, combat narration, renown, typewriter, thinking indicator, 50/day budget, graceful degradation) are treated as dependencies, not re-researched.

## Ground Truth From the Existing Code (drives everything below)

| Observation | Source | Consequence |
|-------------|--------|-------------|
| Every call takes 5+ hops: reducer -> `llm_task` row -> subscription push -> browser watcher -> Cloudflare Worker -> OpenAI -> browser -> `submit_llm_result` reducer -> subscription push | `useLlmProxy.ts`, `llm-proxy/src/index.ts` | Procedure-direct removes 2 browser round trips and the CF hop. Also removes correctness bugs (below). |
| Generation is driven by the browser tab. `submittedTaskIds` is an in-memory Set and `isProcessing` is per-tab | `useLlmProxy.ts` | Refresh mid-call orphans the task (stuck `pending`). Two tabs on one identity can double-call. Moving server-side fixes both. |
| `llm_task` is `public: true` and carries `systemPrompt` + `userPrompt` | `schema/tables.ts:2108` | Every client can read every player's prompts (world canon, NPC memory). The new request table must be private. |
| Model IDs hardcoded in 4+ places (`'gpt-5-mini'` in npc_interaction, renown, combat_narration; `validModels` in reducers/llm.ts) | grep | Need one central domain -> model/effort/timeout/max_tokens map. |
| Budget = flat count, 50 calls/day/player, incremented only on success | `helpers/llm.ts` | Count ignores model cost (Sonnet vs Haiku differ 2x on price, and heavy vs light calls differ 10x in tokens). Combat narration can starve creation/world gen. |
| System prompt is one string: `NARRATOR_PREAMBLE` + task + `## World Context ${context}` | `data/llm_prompts.ts` | Stable-first ordering is already right for caching, but it is a single string, so no `cache_control` split is possible without refactor. |
| Prompts say "You must always respond with valid JSON matching the schema in the user message"; schema is prose in the user prompt plus OpenAI `responseFormatJson` | `llm_prompts.ts`, `llm_task.responseFormatJson` | Migrate to `output_config.format` (json_schema). Prose schema and "respond in JSON" lines become redundant tokens. |
| One active request per player; all failures collapse to one of three Keeper lines | `reducers/llm.ts` | Failure taxonomy is too coarse for Anthropic's error set (401/402/429/529 mean very different things to an operator). |
| Typewriter animates after full completion; `isLlmProcessing` shows "The Keeper is considering your fate..." | `NarrativeConsole.vue` | Typewriter hides nothing: time-to-first-text = full generation time. |

## Feature Landscape

### Table Stakes (Users Expect These)

If any of these is missing the migration is a regression: players see a slower, flakier, or less-Keeper-like game than v2.0.

#### Perceived latency

| Feature | Why Expected | Complexity | Dependencies / Notes |
|---------|--------------|------------|----------------------|
| Per-domain latency budgets (targets) and a "never block the game on the LLM" rule | Real-time games treat LLM text as garnish on top of authoritative state. Combat must not wait on narration. | LOW | Targets (MEDIUM/LOW confidence, validate with smoke test): combat narration first text <= ~2-3 s, else drop; NPC reply <= ~3 s; skill gen <= ~8 s; class reveal <= ~10-15 s; world gen 20-60 s with staged progress. Depends on `combat_narration.ts` async path (already async), `NarrativeConsole` indicator. |
| Haiku 4.5 for every short/interactive domain, with NO thinking config and NO `effort` param | Haiku 4.5 uses `budget_tokens` thinking (off if omitted) and errors on `effort`. Omitting both gives lowest TTFT. | LOW | Central request builder must gate params per model (see model-tier row). |
| Sonnet 5.5 at `effort: "low"` for creation/world gen; test `thinking: {type:"between_tools"}` as the thinking-off variant | Anthropic guidance: from `medium` up, Sonnet 5.5 thinks briefly before almost every reply, which adds to time-before-first-token; `low` skips thinking on most simple requests and is the recommended start for content generation. `thinking:{type:"disabled"}` is a 400 on 5.5. `between_tools` is accepted only at effort <= high and with no other thinking field. | LOW | Sweep low vs between_tools on real creation prompts. Effort default is `high` if unset, so it MUST be set explicitly or every call pays thinking latency. Pin effort per domain (changing effort between requests invalidates the cache). |
| Tight `max_tokens` per domain (keep current 400-1200 for light domains; size Sonnet domains from measured output) | Output tokens dominate latency; also a hard cost ceiling. Sonnet 5.5 sizing must leave room if any thinking occurs. | LOW | Truncation (`stop_reason: max_tokens`) must be detected and treated as failure, not parsed. |
| Staged, in-voice progress indicator for long calls (world gen, class generation) | >5-10 s of a static spinner reads as a hang. Games rotate flavor lines. Zero LLM cost. | LOW | Extends existing "considering your fate" indicator. Keeper-voiced rotating lines keyed to domain; elapsed-time escalation ("The Keeper is being thorough. Do not be alarmed."). Depends on `isLlmProcessing`, `creation` event kinds. |
| Result survives tab close/refresh | Server-side generation completes regardless of client state; result is in tables when the player returns. | MEDIUM | Falls out of the procedure path (or a backend service). Requires task states that a reconnecting client can render (`pending`/`processing`/`completed`/`error`). Fixes the orphaned-task and double-tab bugs above. |
| Stuck-task sweep with per-domain deadlines | A crashed/timed-out call must not leave a player permanently blocked by the "one active request" rule. | LOW-MEDIUM | Extend existing `sweep_llm_errors` scheduled reducer to time out `pending`/`processing` rows; guard against late completion (status check inside the commit transaction). |

#### Prompt caching of stable prefixes

| Feature | Why Expected | Complexity | Dependencies / Notes |
|---------|--------------|------------|----------------------|
| Split system prompt into cacheable stable block + volatile tail | Caching is a prefix match; today's single-string prompt cannot carry a breakpoint. Order is already correct (preamble, task, then context). | MEDIUM | Refactor `buildXPrompt(context)` to return blocks `[{stable, cache_control}, {context}]`. Keep tests for prompt builders. Never interpolate timestamps/IDs/player names into the stable block; serialize any canon deterministically (sorted keys). |
| Know the minimum-cacheable-prefix per model, and make the stable block clear it | Below the minimum, `cache_control` silently does nothing (no error, `cache_creation_input_tokens: 0`). Sonnet 5.5: 512 tokens (verify before relying). **Haiku 4.5: 4096 tokens.** Current preamble is ~250 tokens; the combat prompt is ~800. So today NONE of the Haiku prompts would cache. | MEDIUM | Haiku domains need a stable Keeper style bible + few-shot examples of at least ~4K tokens to cache. That same content also anchors tone parity (see quality section), so the tokens do double duty. Cost of a 4K cached prefix on Haiku is ~$0.0004 per read vs ~$0.004 uncached. |
| Verify caching with `usage.cache_read_input_tokens` and log it | The costliest caching failure is silent (requests succeed, bill is higher). A standing check beats a one-time look. | LOW | Log `cache_read/creation/input/output` per call to the call log; add a test/smoke assertion that a second identical request reads from cache. |

Reality check on the TTFT claim (MEDIUM confidence): caching is primarily a COST lever at these prompt sizes (reads ~0.1x input price). It also shortens prefill, but with 1-4K token prefixes the TTFT gain is small compared with removing thinking, capping output, and removing hops. Do not promise a latency win from caching alone.

#### Per-task model/effort tiering

| Feature | Why Expected | Complexity | Dependencies / Notes |
|---------|--------------|------------|----------------------|
| One central tier map: domain -> {model, effort or thinking mode, max_tokens, timeout, fallback, budget pool, schema} | Today models are scattered string literals; model IDs churn. Decided tiers: Sonnet 5.5 = character creation + world gen; Haiku 4.5 = skills, NPC chat, combat narration, renown. | LOW | Replaces `validModels` allowlist in `reducers/llm.ts`; server-side allowlist stays (client must never choose the model). Unit-test that every domain resolves and that Haiku entries never carry `effort`, Sonnet entries never carry `disabled`/temperature. |
| Per-model request builder that strips unsupported params | Sonnet 5.5 400s on `thinking:disabled`, non-default `temperature/top_p/top_k`, forced `tool_choice`, assistant prefill. Haiku 4.5 400s on `effort`. A shared builder prevents a wrong parameter from taking down one domain. | LOW-MEDIUM | Existing code sets no temperature, so nothing to remove, but a fallback re-send to another model must drop `between_tools` (Sonnet-5.5-only) and `effort` (Haiku-invalid). |
| Structured outputs via `output_config.format` for all JSON domains | Replaces OpenAI `response_format`. Guarantees syntactically valid JSON on Sonnet 5.5 and Haiku 4.5 (both supported). | MEDIUM | Schema limits: `additionalProperties:false` required on all objects; NO `minimum/maximum`, `minLength/maxLength`, recursion. Existing ranges ("value1 8-15", "cooldown 4-12", "castSeconds >= 1 for mana") become description text only, so the v2.0 schema validation and power-budget checks MUST stay as the real enforcement. Put field guidance (e.g. the raceName exact-name rule) into schema `description`s. Handle `stop_reason` `max_tokens` and `refusal` (output may not match schema). |
| Schema warm-up after deploy | A new schema pays a one-time grammar compile on first use (cached ~24 h per the docs). Without warm-up, the first player after each deploy eats extra latency, mostly on the big class/region schemas. | LOW | Run each schema once from the operator smoke test post-publish. |

#### Failure handling

| Feature | Why Expected | Complexity | Dependencies / Notes |
|---------|--------------|------------|----------------------|
| Error taxonomy mapped to distinct actions (not one "Keeper is absent") | Anthropic returns 400/401/402/403/404/413/429/500/529 plus `stop_reason: refusal` and `max_tokens`. The right response differs: 401/403/402 are operator alerts (key invalid, org blocked, credits exhausted), 429/529/5xx are transient, 400 is a code bug. Today OpenAI "no credits" 429 shows players a generic failure. | MEDIUM | Classifier as a pure function (unit-testable). Store `errorType` + Anthropic `request_id` on the task/log row. |
| Bounded retries with per-domain deadline | Transient 429/529/5xx are normal at real load. Inside a procedure there is no SDK auto-retry (and probably no ability to sleep), so retry logic is ours and adds to blocking time. | MEDIUM | 429: honor `retry-after` only if short, else fail fast. 529/500: one immediate retry. Never exceed the domain timeout (`ctx.http.fetch` accepts a timeout; host clamps at 180 s; default 30 s). Interactive domains fail fast; world gen/creation get the long budget. |
| Timeout per domain (set explicitly) | Old 2.0.1 failure was likely the 500 ms default; 2.10 default is 30 s, which is too short for world gen and too long for combat. | LOW | Suggested: combat ~8 s, NPC ~15 s, skill ~30 s, creation ~45 s, world gen ~90-120 s. Tune from smoke test. |
| Graceful degradation per domain, in Keeper voice | Existing behavior must survive the swap. Combat narration: silently skip, mechanical log stands. NPC chat: in-character deflection, no affinity/memory mutation. Skill gen / creation / world gen: preserve state (creation step reverts, region lock released) and offer retry. | MEDIUM | Depends on `CharacterCreationState` steps, `world_gen_state` generation locks, `pending_skill`. Failure must release locks; budget must not be charged (existing "increment only on success" rule stays). |
| Distinct handling of `stop_reason: "refusal"` | A dark-fantasy sardonic narrator can trip classifiers. Sonnet 5.5 declines in 5 categories (`cyber`, `bio`, `frontier_llm`, `reasoning_extraction`, `general_harms`); benign content can trigger `general_harms`. Refusal is HTTP 200, not an error, so naive code parses garbage. | MEDIUM | Branch on `stop_reason` before touching `content`. Server-side fallback (`fallbacks:"default"`, beta `server-side-fallback-2026-07-01`, Claude API only) retries only `cyber`/`frontier_llm` on Sonnet 5, NOT `general_harms`; so for this game the practical fallback is our own: one retry with the player-supplied text quoted/softened, then a Keeper-voiced "the Keeper declines to remember that" and a re-prompt. Log category for the operator. |
| Never trust raw model text into game state | Structured output guarantees JSON shape, not game validity. | LOW (exists) | Keep v2.0 validation (kind enum, power budget, name rules, exact race name) on the result path. |

#### Budget and cost controls

| Feature | Why Expected | Complexity | Dependencies / Notes |
|---------|--------------|------------|----------------------|
| Recalibrated budget: separate heavy (Sonnet) and light (Haiku) pools per player per day | One shared 50-call pool lets combat narration exhaust the allowance before a player creates a character or triggers a region. | LOW | Modify `checkBudget`/`incrementBudget` to take a pool. Suggested starting point (tune): heavy ~10/day, light ~150-200/day. Reset logic (UTC date) unchanged. |
| Token/cost accounting from real `usage` on every call | Claude returns `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`. Needed to see whether recalibration is right. | MEDIUM | Price table in code (Sonnet 5.5 $2/$10 per MTok, cache read $0.20; Haiku 4.5 $1/$5). Rough per-call cost: creation ~ $0.02, world gen ~ $0.04, NPC/combat/skill ~ $0.002-0.004. Store as integer micro-dollars. |
| Global daily spend ceiling + kill switch | With the proxy gone, one server-held key is the only spend gate, and there is no per-player proxy secret. A bug or abusive account could burn the whole balance. | LOW-MEDIUM | `llm_config` flags: enabled, per-domain enable, global daily cap. Also set a workspace spend limit in the Anthropic Console as an out-of-band backstop (operator step, not code). |
| Reserve-then-settle accounting for procedures | Procedure HTTP happens outside a transaction; concurrent calls could all pass the check before any settles. | MEDIUM | Reserve estimated cost inside `ctx.withTx` before the fetch, settle to actual `usage` after. Keeps the "one active request per player" rule as first line of defense. |

#### Output quality parity

| Feature | Why Expected | Complexity | Dependencies / Notes |
|---------|--------------|------------|----------------------|
| Prompt port pass for Claude | Prompts were tuned on gpt-5.x. Emphatic ALL-CAPS rules and "always respond in JSON" lines are unneeded with structured outputs; Anthropic guidance is that prompts written for prior models are often too prescriptive on newer ones. Cut redundant schema prose, keep voice rules and NAMING RULES. | LOW-MEDIUM | `llm_prompts.ts` + domain builders. Behavior-neutral changes must be checked by the golden set below. |
| Golden-input regression set with mechanical assertions | The Keeper voice cannot be unit-tested, but many rules can: exact race name preserved ("Cyclops" stays "Cyclops"), class name 1-2 words, banned naming words absent (Verge, Veil, Ashen, ...), combat narration contains the exact ability names and damage numbers supplied, no "as an AI", sentence-count bounds, schema-valid, power budget passes. | MEDIUM | ~10-20 fixed inputs per domain (races: specific, vague, absurd, generic). Run live on demand (costs money, so operator approval per run); mock-level unit tests for the assertion helpers and request builder run in the existing Vitest suite (project rule: every phase ships unit tests). |
| Live end-to-end verification with a real Claude call | Milestone success criterion. The unit suite (990 tests) is mocked and cannot prove the network path. | LOW | Same tool as the operator smoke test. |

#### Operator features

| Feature | Why Expected | Complexity | Dependencies / Notes |
|---------|--------------|------------|----------------------|
| Admin live smoke test (Haiku + Sonnet + each schema) | Cannot tell "key wrong / no credits / procedure HTTP broken / model ID typo / schema rejected" apart otherwise. This is exactly the failure the project is in now. | LOW-MEDIUM | Admin-only (uses existing `requireAdmin`); tiny prompts; reports status, latency, tokens, cache reads, Anthropic `request_id`. Doubles as cache pre-warm and schema warm-up. Never returns or logs the key. |
| Private call log with latency + usage + outcome | Without it, latency tuning and budget calibration are guesswork. | MEDIUM | New private table (`llm_call_log`): domain, model, effort, start-to-end ms, tokens (4 kinds), cost, status, errorType, retries, request_id. Bounded retention via the existing scheduled cleanup. |
| Admin-visible key status (present/absent, last updated, last successful call) | `set_api_key` exists; nothing reports health. | LOW | Never expose the key value to clients; `llm_config` must stay non-public. Note the stale comment in `LlmRequest` (`'claude-opus-4-6'`) and `set_api_key` message; clean up. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Speculative class generation during archetype choice | Class depends only on race + archetype (2 options), and the name is asked AFTER the class reveal. Once the race is interpreted, fire both Warrior and Mystic class generations in parallel while the player deliberates; the reveal is instant on pick. Wasted cost: one Sonnet call (~$0.02) per creation. Biggest perceived-latency win available for the flagship first-run moment. | MEDIUM | Depends on `CharacterCreationState` (AWAITING_ARCHETYPE -> GENERATING_CLASS), heavy-pool budget (charge only the consumed result, or 2 units and document it), stale-result invalidation if the player goes back and changes race (existing CONFIRMING_GO_BACK path). Discard rather than reuse across races. Verify "class depends only on race + archetype" in the creation prompt path first. |
| Two-lane world gen: fast Haiku in-voice "stall" prose + slow Sonnet structured region | Masks 20-60 s of world gen with real Keeper text (the Keeper "remembering" the place) instead of a spinner. Truly on-brand. | MEDIUM-HIGH | Stall text is disposable and must not contradict canon (write it vague / atmospheric, or derive it from player action, not from region output). Extra Haiku cost is ~$0.002. Depends on generation lock and `event_creation`/console output kinds. |
| Cost- and cache-aware canon block shared across players | World canon is global, so one cached "world canon" block (second breakpoint after the Keeper bible) can be read by every player's NPC/combat/skill call until a new region changes it. Max 4 breakpoints per request. | MEDIUM | Canon must render byte-identically (deterministic order, no volatile fields) and be size-capped (a digest, not the full history), or every region creation rewrites it. Player-specific data (NPC memory, affinity, character) goes AFTER the breakpoint. If traffic is sparse (small playtest), use `ttl: "1h"` on the stable block (2x write, single write per hour, cheaper than repeated cold 5-minute misses). |
| Coalesced combat narration | Narrate per beat/batch instead of per event; drop or merge when a backlog exists or combat ended. Fewer calls, less budget burn, text that matches what the player is currently seeing. | MEDIUM | Depends on `combat_narration.ts` and the event log; stale results (older than N seconds or combat over) are discarded. |
| Real streaming for prose domains (NPC reply, combat narration) | Prose starts appearing within ~TTFT instead of after full generation; strongest "alive" feel. | HIGH | NOT available on the procedure path: `ctx.http.fetch` is synchronous and returns the full body. Only possible if the fallback backend service exists, streaming SSE and coalescing chunks (~150-250 ms) into a table via reducer, or serving SSE to the browser authenticated with the player's SpacetimeAuth JWT (no LLM credential in the browser). Only worthwhile for outputs > ~3 s of generation; JSON domains are not streamable as prose. Recommendation: keep Out of Scope for v2.2 unless the spike fails and the backend service is built anyway. |
| Pre-generation of level-up skills near threshold | Player hits level, options already waiting. Unchosen skills already vanish by design, so waste is harmless mechanically. | MEDIUM | Depends on 3-skill generation, XP thresholds; invalidate on stat/class changes. Cost ~$0.003 per speculative call, but adds speculative spending to the budget model. Defer until measured skill-gen latency justifies it. |
| Per-message effort / effort A/B via a config-only knob | Lets the operator tune quality vs latency per domain without a code deploy. | LOW | Tier map in `llm_config` rather than code constants. Note changing effort invalidates the cache, so treat as a deliberate change, not per-request. |
| Latency/cost dashboard in the narrative console (admin `/llm stats`) | p50/p95 TTFT-equivalent and total latency per domain, cache hit ratio, daily spend, error rate by type. | MEDIUM | Reads `llm_call_log`. A text summary is enough; no new UI panel. |
| Cache pre-warm on deploy / low-traffic gaps | Removes the first-request cold write for the first player after idle. | LOW | `max_tokens: 0` request on the cached prefix (no output billed). Rejected with `output_config.format` and `stream:true`; whether a format-less warm request writes the same cache entry as the real structured request is UNVERIFIED (LOW confidence) so check `cache_read_input_tokens` on the first real call. Skip when traffic is continuous. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Streaming everything "because latency" | Feels like the obvious low-latency lever | Procedure fetch cannot stream; structured JSON is not readable mid-stream; typewriter already animates completed text; would force the backend-service path and chunk-write churn for marginal gain on short Haiku outputs | Remove hops, no thinking on Haiku, `effort: low` on Sonnet, tight `max_tokens`, staged progress lines, speculative creation, Haiku stall lane for world gen |
| Opus/Fable-tier models for narration | "Best prose" | Higher price and (for Fable/Opus 5.5) thinking cannot be disabled; latency and cost work against real-time goal; decided tiers already fixed | Sonnet 5.5 for the two flagship generations only |
| Auto-fallback Sonnet -> Haiku for creation/world gen by default | "Never fail" | Silent quality drop on the one-of-a-kind class and the canonical region that persists forever; tone and schema fidelity differ | Retry once on Sonnet, then fail with retry and preserved state. Make Haiku fallback an explicit per-domain opt-in flag (off for creation/world gen; acceptable for skills) |
| Thinking on for narration (`effort` medium+/xhigh) | "Smarter output" | Adds time before first token on every reply; no measured quality gain for prose | `low`; raise only where an eval shows gain |
| Blocking combat until narration returns | Narration "belongs" to the event | Real-time combat stalls on network jitter or 529s | Fire-and-forget; mechanical log first, narration appended or dropped |
| Client-side retries / client-held credentials | Simple | Re-creates the browser-secret problem; tab-dependent | All retries server-side, single owner of each task |
| Raising the per-player call cap to hide latency/failures | Fewer complaints | Removes the only cost control; a server-held key means a leak or bug is expensive | Pool split + cost-weighted accounting + global cap + kill switch |
| LLM-judged tone check in the hot path | Guarantee voice | Doubles latency and cost per call | Offline golden-set eval with LLM judge; mechanical assertions in runtime validation |
| Per-request dynamic content in the cached prefix (timestamps, player name, request IDs) | Personalization | Silently zeroes cache hits | Put volatile content after the last breakpoint |
| Speculatively pre-generating neighbor regions/NPCs | "Zero wait when exploring" | Contradicts "world is generated through play"; burns Sonnet spend; creates canon nobody visited | Two-lane stall text + staged progress for world gen |
| Prompt-injection "moderation" via a second LLM call per NPC message | Safety | Doubles NPC latency | Keep player text in the user turn, delimit it, validate outputs mechanically; Claude holds a system-prompt role better than most |

## Feature Dependencies

```
Central tier map (model/effort/max_tokens/timeout/pool/schema)
    |--requires--> Per-model request builder (param gating)
    |                  |--enables--> Structured outputs (output_config.format)
    |                  |--enables--> Refusal / max_tokens / error classification
    |--enables--> Budget pools (heavy vs light)
                      |--enables--> Cost accounting from usage --enables--> Global cap + kill switch

Server-side owner of each call (procedure spike OR backend service)
    |--enables--> Survives tab close / no double-call
    |--enables--> Private request table (no prompt leakage)
    |--requires--> Per-domain timeouts + stuck-task sweep
    |--requires--> Reserve-then-settle budget (outside-tx HTTP)
    |--conflicts--> True streaming (procedure fetch is buffered)

Prompt split (stable block + volatile tail)
    |--requires--> Haiku stable prefix >= 4096 tokens (Keeper bible + few-shot) to cache
    |--enhances--> Tone parity (few-shot doubles as voice anchor)
    |--enhances--> Shared world-canon cached block (needs deterministic canon digest)

Call log (latency, usage, errors)
    |--requires--> Admin smoke test (first live numbers)
    |--enables--> Effort sweep / budget tuning / cache verification / dashboard
    |--enables--> Deciding whether streaming or pre-generation is justified

Golden-set eval --requires--> Prompt port pass, Structured outputs
Speculative class generation --requires--> Creation state machine + heavy pool + stale-result discard
Two-lane world gen --requires--> Staged progress indicator + generation lock
```

### Dependency Notes

- **Streaming conflicts with the procedure path.** The whole "retire the proxy" direction gives up streaming to keep the architecture simple. Keep the two decisions linked in the roadmap: if the spike fails and the backend service is built, revisit streaming for NPC/combat prose only.
- **Structured outputs require that validators stay.** Numeric range constraints are not supported by the schema subset, so the v2.0 power-budget and range validation are load-bearing.
- **Caching requires prompt refactor before any latency claim.** Do the block split and Haiku prefix sizing early, then measure with `cache_read_input_tokens`; do not assume it works.
- **Model-specific params:** Sonnet 5.5: no `thinking:disabled`, no non-default sampling params, no forced `tool_choice`, no prefill, `effort` default `high`. Haiku 4.5: no `effort`, thinking only via `budget_tokens` (omit). A fallback re-send must rebuild, not reuse, the request body.
- **Sonnet 5.5 has its own rate-limit pool and no Priority Tier.** Bursts of creation/world gen depend on standard-tier 429 handling; check the account tier's limits before opening to more players.
- **Budget and failures interact:** budget increments only on success (keep), but reservations (new) must be released on every failure path.

## MVP Definition

### Launch With (v2.2 core)

- [ ] Central tier map + per-model request builder (gates params, allowlists models server-side) - foundation for everything else
- [ ] Anthropic call path (procedure spike result or backend service) with per-domain timeout, bounded retry, error taxonomy, refusal/max_tokens handling
- [ ] Structured outputs via `output_config.format` for all JSON domains, with v2.0 validators retained
- [ ] Haiku 4.5 with no thinking/effort; Sonnet 5.5 with explicit `effort: "low"` (or `between_tools`) chosen by a quick measured sweep
- [ ] Prompt block split + stable prefix sizing (>= 512 tokens Sonnet, >= 4096 Haiku), cache-usage logging
- [ ] Two-pool budget + usage-based cost accounting + global cap/kill switch
- [ ] Private call log + admin smoke test (also schema warm-up), key status, no browser credentials, private request table
- [ ] Staged in-voice progress lines for long calls; combat narration non-blocking and droppable
- [ ] Stuck-task sweep with deadlines; graceful degradation per domain preserved
- [ ] Golden-set live eval (operator-approved) + mocked unit tests for builder, classifier, budget math, refusal handler

### Add After Validation (v2.2 late / v2.3)

- [ ] Speculative class generation (trigger: measured class-reveal latency > ~10 s or playtest complaint)
- [ ] Shared world-canon cached block (trigger: call volume high enough that canon tokens matter, or canon digest stabilizes)
- [ ] Coalesced combat narration (trigger: light-pool burn or narration lagging the fight)
- [ ] Two-lane world gen stall text (trigger: world gen measured > ~20 s)
- [ ] Admin `/llm stats` summary in the console
- [ ] Cache pre-warm (trigger: cold-start misses visible in the call log)

### Future Consideration (v2.3+)

- [ ] Real streaming for NPC reply and combat narration (only if backend-service path is chosen)
- [ ] Level-up skill pre-generation
- [ ] Haiku fallback opt-in for skill generation; Batch API for non-interactive backfill work (50% cost, async)
- [ ] Per-message effort switching (beta) if a single conversational route needs both fast and deep modes

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Tier map + per-model builder | HIGH | LOW | P1 |
| Error taxonomy + bounded retry + timeouts | HIGH | MEDIUM | P1 |
| Structured outputs migration | HIGH | MEDIUM | P1 |
| Effort/thinking tuning (Sonnet low, Haiku none) | HIGH | LOW | P1 |
| Admin smoke test + call log | HIGH | MEDIUM | P1 |
| Two-pool budget + cost accounting + cap | HIGH | MEDIUM | P1 |
| Prompt split + Haiku prefix + cache logging | MEDIUM (cost) / LOW-MED (latency) | MEDIUM | P1 |
| Refusal handling | MEDIUM | MEDIUM | P1 |
| Staged progress lines | MEDIUM | LOW | P1 |
| Result survives refresh (server-owned calls) | MEDIUM | MEDIUM | P1 (side effect of architecture) |
| Golden-set eval | MEDIUM | MEDIUM | P1 |
| Speculative class generation | HIGH | MEDIUM | P2 |
| Two-lane world gen | MEDIUM | MEDIUM-HIGH | P2 |
| Shared canon cached block | MEDIUM | MEDIUM | P2 |
| Coalesced combat narration | MEDIUM | MEDIUM | P2 |
| Streaming | MEDIUM | HIGH | P3 (conditional) |
| Skill pre-generation | LOW-MEDIUM | MEDIUM | P3 |

## Sources

- claude-api skill reference (Anthropic-maintained, cached 2026-09-25): current models and pricing (Sonnet 5.5 $2/$10, Haiku 4.5 $1/$5, cache reads ~0.1x), model migration notes for Sonnet 5.5 (thinking `disabled` 400, `between_tools`, effort recalibration and "low for content generation", refusal categories and fallback scope, own rate-limit pool, no Priority Tier), prompt caching guide (prefix semantics, per-model minimums: Haiku 4.5 = 4096, Sonnet 5.5 = 512, TTL economics, `max_tokens:0` pre-warm and its rejected combinations), structured outputs limits (no numeric/string constraints, `additionalProperties:false`, 24 h schema cache, refusal/max_tokens caveats), error-codes reference (429/529 retryable, `retry-after`, `request_id`). Confidence HIGH.
- Project files read: `.planning/PROJECT.md`, `spacetimedb/src/data/llm_prompts.ts`, `spacetimedb/src/reducers/llm.ts`, `spacetimedb/src/helpers/llm.ts`, `spacetimedb/src/schema/tables.ts` (llm_task, llm_config, llm_request, llm_budget), `src/composables/useLlmProxy.ts`, `llm-proxy/src/index.ts`, `src/components/NarrativeConsole.vue`. Confidence HIGH.
- SpacetimeDB docs and issues (web search): `ctx.http.fetch` is synchronous, user timeout clamped to 180 s, HTTP/2 negotiated for procedure HTTPS, async procedures under development (issue #4697). https://spacetimedb.com/docs/procedures/ , https://github.com/clockworklabs/SpacetimeDB/issues/4697 . Confidence MEDIUM (secondary summary; confirm blocking behavior of sync procedures under concurrent load in the spike).
- Latency targets, per-call cost estimates and suggested pool sizes are the researcher's engineering estimates, not measured. Confidence LOW until the smoke test and call log produce data.
