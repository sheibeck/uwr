# API Coverage — Anthropic Messages API (Phase 40 request layer)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> Scope: the pure, executor-agnostic layer that builds, parses and classifies every `claude-sonnet-5-5` call, plus job storage. No live call is made in Phase 40 (the send is faked through `createMockProcCtx`); Phase 41's executor sends the requests this layer builds. Rows are re-decided from the Phase 39 matrix, not carried over.
> The detector also matched the words "API usage limits" (a fixture's error message) and "Anthropic API" in threat-model prose; both refer to this same Messages API surface.

| capability | decision | reason |
|---|---|---|
| messages-create (POST /v1/messages body and headers) | INTEGRATE | |
| structured-outputs (output_config.format json_schema) | INTEGRATE | |
| effort-control (output_config.effort, explicit per route) | INTEGRATE | |
| prompt-caching (cache_control on Bible and route block, 5m) | INTEGRATE | |
| usage-accounting (input, output, cache-write, cache-read tokens) | INTEGRATE | |
| stop-reasons-and-refusals (stop_reason, stop_details) | INTEGRATE | |
| error-shapes-and-headers (status classes, request-id, retry-after) | INTEGRATE | |
| models-list (GET /v1/models) | OPT-OUT | not needed: the model is one pinned constant (CLAUDE-01) and Phase 39 verified it is available |
| prompt-caching-1h-ttl | OPT-OUT | not needed yet: CONTEXT locks the default 5-minute TTL; Phase 43 tunes TTL and breakpoints |
| thinking-between-tools-variant | OPT-OUT | explicitly out of scope: CONTEXT omits thinking; the A/B test is deferred to Phase 43 |
| rate-limit-headers (anthropic-ratelimit-*) | OPT-OUT | not needed yet: the parser keeps request-id and retry-after; Phase 41's in-flight cap and Phase 43's tuning decide whether to read these |
| streaming-sse | OPT-OUT | explicitly out of scope milestone-wide: procedure ctx.http.fetch is synchronous |
| message-batches | OPT-OUT | not needed: gameplay calls are interactive and latency-bound; batches are asynchronous |
| token-counting (POST /v1/messages/count_tokens) | OPT-OUT | not needed yet: the Bible is bounded offline by a character range; calibration with count_tokens is Phase 44 when a real key is used |
| tool-use | OPT-OUT | not needed: no route uses tools; structured outputs cover JSON; forced tool_choice is rejected on Sonnet 5.5 |
| assistant-prefill | OPT-OUT | not supported: prefill returns 400 on Sonnet 5.5; the body guard forbids assistant messages |
| sampling-params (temperature, top_p, top_k) | OPT-OUT | not supported: non-default values return 400 on Sonnet 5.5; the body guard forbids them |
| stop-sequences | OPT-OUT | not needed: every route ends on end_turn; the body guard forbids the key |
| request-metadata (metadata.user_id) | OPT-OUT | not needed yet: abuse attribution can be added in Phase 41 with a hashed player id if wanted |
| service-tier | OPT-OUT | not needed: the default tier is used; latency tuning is Phase 43 |
| files-api | OPT-OUT | not needed: no file inputs in any route |
| vision-and-pdf-input | OPT-OUT | not needed: no image or document inputs in any route |
| citations-and-search-results | OPT-OUT | not needed by any route |
| server-tools (web search, code execution, MCP connector) | OPT-OUT | explicitly out of scope: not needed by any route |
| admin-and-usage-cost-api | OPT-OUT | not needed yet: spend tables and the cost budget are Phase 41; budget tooling is Phase 43 |
| beta-headers | OPT-OUT | not needed: nothing in this layer requires a beta feature |
