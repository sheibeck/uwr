# API Coverage — Anthropic Messages API (Phase 41 executor)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> Scope: the scheduled procedure `llm_run` (`helpers/llm_executor.ts`) that sends every `claude-sonnet-5-5` request built by the Phase 40 layer through `ctx.http.fetch`, classifies the reply, settles cost and applies the result; plus the admin smoke test. Every row below was re-decided for Phase 41 from Phase 40's matrix, because Phase 41 is the first phase that actually sends requests.
> The detector's signal came from plan text about the SpacetimeDB HTTP API that the key script uses (`POST /v1/database/uwr/call/set_api_key`); that surface is decided in the last two rows, prefixed `spacetimedb-http`.

| capability | decision | reason |
|---|---|---|
| messages-create (POST /v1/messages from the scheduled procedure) | INTEGRATE | |
| authentication-headers (x-api-key from private llm_config, anthropic-version) | INTEGRATE | |
| request-timeouts (per-route timeout passed to ctx.http.fetch) | INTEGRATE | |
| structured-outputs (json_schema on the five JSON routes; smoke warms each) | INTEGRATE | |
| effort-control (explicit low effort per route) | INTEGRATE | |
| prompt-caching (5-minute cache_control on the Keeper Bible and route block) | INTEGRATE | |
| usage-accounting (four token counts per call; cost settlement) | INTEGRATE | |
| stop-reasons-and-refusals (end_turn allowlist; others fail by class) | INTEGRATE | |
| error-shapes-and-headers (status classes, request-id, retry-after backoff) | INTEGRATE | |
| models-list (GET /v1/models) | OPT-OUT | not needed: the model is one pinned constant and the admin smoke test proves it answers |
| prompt-caching-1h-ttl | OPT-OUT | not needed yet: CONTEXT keeps the default 5-minute TTL; Phase 43 tunes TTL from measured cache reads |
| thinking (extended or adaptive) | OPT-OUT | explicitly out of scope: routes run without thinking; the A/B is Phase 43 |
| rate-limit-headers (anthropic-ratelimit-*) | OPT-OUT | not needed yet: retry-after plus the global in-flight cap of 4 bound the load; Phase 43 may read them when tuning the cap |
| streaming-sse | OPT-OUT | explicitly out of scope milestone-wide: procedure ctx.http.fetch is synchronous |
| message-batches | OPT-OUT | not needed: every call is interactive and latency-bound |
| token-counting (POST /v1/messages/count_tokens) | OPT-OUT | not needed yet: reservations use the conservative chars / 3 estimate and settle on real usage; calibration is Phase 44 |
| tool-use | OPT-OUT | not needed: no route uses tools; structured outputs cover JSON |
| assistant-prefill | OPT-OUT | not supported: prefill returns 400 on Sonnet 5.5; the body guard forbids assistant messages |
| sampling-params (temperature, top_p, top_k) | OPT-OUT | not supported: non-default values return 400 on Sonnet 5.5; the body guard forbids them |
| stop-sequences | OPT-OUT | not needed: every route ends on end_turn; the body guard forbids the key |
| request-metadata (metadata.user_id) | OPT-OUT | not needed yet: per-player attribution lives server-side in llm_call_log.playerId; a hashed id for abuse reports can be added in Phase 43 or 44 |
| service-tier | OPT-OUT | not needed yet: the default tier is used; latency tuning is Phase 43 |
| files-api | OPT-OUT | not needed: no file inputs in any route |
| vision-and-pdf-input | OPT-OUT | not needed: no image or document inputs in any route |
| citations-and-search-results | OPT-OUT | not needed by any route |
| server-tools (web search, code execution, MCP connector) | OPT-OUT | explicitly out of scope: not needed by any route |
| admin-and-usage-cost-api | OPT-OUT | not needed yet: the in-module $2 ledger, per-player budgets and the Console workspace spend limit bound spend; Phase 43's /llm stats reads llm_call_log |
| beta-headers | OPT-OUT | not needed: nothing in the executor requires a beta feature |
| spacetimedb-http reducer call (set_api_key from scripts/llm/set-key.mjs) | INTEGRATE | |
| spacetimedb-http sql endpoint | OPT-OUT | not needed: the key script confirms through the module log line, and status reads use the spacetime CLI or the admin_llm_status view |
