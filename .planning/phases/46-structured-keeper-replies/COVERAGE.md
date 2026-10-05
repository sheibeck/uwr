# API Coverage — Anthropic Claude Messages API

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

The Messages API was integrated in v2.2 (Phases 39-44: server-side executor in the SpacetimeDB module, `llm_run` procedure, `buildClaudeRequest`, `classifyClaudeResponse`). Phase 46 changes reply formats only: `combat_narration` gains a structured-output JSON schema (46-08) and `npc_conversation` asks for a segments array in its prompt-instructed JSON (46-07). No paid call is made in Phase 46; the paid golden run is deferred to the end-of-milestone testing pass.

| capability | decision | reason |
|---|---|---|
| messages create (non-streaming request and response) | INTEGRATE | |
| system prompt blocks (Keeper Bible and per-route block) | INTEGRATE | |
| prompt caching (cache_control on the Bible and route blocks) | INTEGRATE | |
| structured outputs (output_config.format json_schema), now including combat_narration | INTEGRATE | |
| effort control (output_config.effort, explicit per route) | INTEGRATE | |
| max_tokens per route (tuned from measurements) | INTEGRATE | |
| stop reason handling (end_turn, max_tokens, refusal) | INTEGRATE | |
| error classification and retry policy (4xx, 429, 5xx, overloaded, timeouts) | INTEGRATE | |
| usage and cost accounting (input, output, cache read and write tokens) | INTEGRATE | |
| streaming responses | OPT-OUT | not needed: replies are applied whole inside a transaction after the procedure stores them |
| tool use and function calling | OPT-OUT | not needed: replies are JSON or prose applied by server validators |
| extended or adaptive thinking | OPT-OUT | not needed for short narrative replies; latency and cost budgets exclude it |
| vision and image inputs | OPT-OUT | explicitly out of scope: the game sends text only |
| PDF and Files API inputs | OPT-OUT | explicitly out of scope: no documents are sent |
| Message Batches API | OPT-OUT | not needed: every call is interactive and latency-bound |
| token counting endpoint | OPT-OUT | not needed: reservations use the server's own size estimate (reserveCostMicroUsd) |
| citations and search result blocks | OPT-OUT | not needed: replies are fiction, not grounded answers |
| server tools (web search, web fetch, code execution) | OPT-OUT | explicitly out of scope: the module performs no external lookup through the model |
| MCP connector | OPT-OUT | explicitly out of scope: no MCP servers are used by the game |
| Agent SDK and managed agents | OPT-OUT | explicitly out of scope: single-turn requests from a scheduled procedure |
