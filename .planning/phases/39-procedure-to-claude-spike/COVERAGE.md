# API Coverage — Anthropic Messages + Models API (Phase 39 spike)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> Scope: a throwaway local spike that measures whether a SpacetimeDB 2.10 procedure can call `claude-sonnet-5-5` reliably. Production integration is Phases 40-41; each OPT-OUT below is re-decided there.
> The detector also matched "connects with the generated SDK": that is the project's existing SpacetimeDB TypeScript SDK (reducer calls, procedure calls, subscriptions), used by the harness as-is, not a new external integration.

| capability | decision | reason |
|---|---|---|
| messages-create (POST /v1/messages) | INTEGRATE | |
| models-list (GET /v1/models) | INTEGRATE | |
| structured-outputs (output_config.format json_schema) | INTEGRATE | |
| effort-control (output_config.effort low/medium) | INTEGRATE | |
| thinking-between-tools-variant | INTEGRATE | |
| prompt-caching (cache_control ephemeral, cache_read_input_tokens) | INTEGRATE | |
| error-shapes-and-headers (401/400/429/5xx/529, request-id, retry-after) | INTEGRATE | |
| usage-accounting (input/output/cache write/cache read tokens) | INTEGRATE | |
| streaming-sse | OPT-OUT | out of scope for a throwaway latency/reliability spike (procedure fetch is synchronous); decided per later phase |
| message-batches | OPT-OUT | out of scope for a throwaway latency/reliability spike; decided per later phase |
| files-api | OPT-OUT | out of scope for a throwaway latency/reliability spike; no file inputs in game routes |
| token-counting | OPT-OUT | out of scope for a throwaway latency/reliability spike; spend uses response usage; decided per later phase |
| tool-use | OPT-OUT | no current game route uses tools; out of scope for this spike |
| vision-and-pdf-input | OPT-OUT | no image or document inputs in game routes |
| citations-and-search-results | OPT-OUT | not needed by any game route |
| server-tools (web search, code execution, MCP connector) | OPT-OUT | not needed by any game route; explicitly out of scope |
| admin-and-usage-cost-api | OPT-OUT | spend is bounded by the workspace limit and the in-module cap; budget tooling is Phase 43 |
| beta-headers | OPT-OUT | nothing in this phase requires a beta feature |
