# Phase 44: Edge Coverage from the spec-less probe fallback

Phase 44 has no SPEC, so plan-phase step 7.95 ran the deterministic edge probe (`edge-probe.cjs`) over QUAL-01, QUAL-02 and QUAL-03. It returned 11 applicable edges, all classified. The orchestrator resolved them in auto mode: 11 covered, 0 backstop, 0 unresolved.

The probe also found no `## Prohibitions` section (PROHIB_ABSENT). The planner therefore runs prohibition recall in its own prompt and writes each result into `must_haves.prohibitions` without a descriptor, as `references/specless-probe-fallback.md` §B/§C describes.

## Resolved edges (lift into `must_haves.truths`)

| Req | Category | Resolution | Truth to author |
|-----|----------|------------|-----------------|
| QUAL-01 | adjacency | covered | Golden-set range and budget assertions are inclusive at both ends. A value exactly at a limit passes and one step past it fails, and unit tests pin both cases. The limits include stat ranges, levels, ability counts, `max_tokens` and reply length. |
| QUAL-01 | empty | covered | When a golden item gets an empty reply (empty text, empty JSON, or a refusal with no content), it is recorded as a failed item with a reason. It is never skipped. A run with zero completed items, or an empty golden set, can never record a tone approval. |
| QUAL-01 | ordering | covered | Golden items have stable ids and always run and report in a fixed id order. Re-running only the failed items keeps the ids, and the review page lists items in the same order on every run. |
| QUAL-02 | adjacency | covered | Console reconciliation passes when the `llm_call_log` token totals are within ±2% of the user-supplied Console totals, and exactly 2.00% passes. The percentage is computed with integer math on token counts. The time window is inclusive at both ends, and its start and end are recorded. |
| QUAL-02 | empty | covered | If a domain has no live call in the verification window, its check is reported as "not run" and fails. It never passes with zero latency. If the user defers giving the Console totals, reconciliation is recorded as deferred, not passed. |
| QUAL-02 | ordering | covered | The per-route latency table lists routes in the fixed `LLM_ROUTE_NAMES` order. p50, p95 and p99 use the same nearest-rank rule as Phase 43 (`helpers/measurement.ts percentile`), so a re-run over the same samples gives identical numbers. |
| QUAL-03 | boundary | covered | Each drill is tested at its threshold and one step either side. The spend-cap drill runs at the ceiling minus 1, the ceiling, and the ceiling plus 1 micro-USD. The timeout drill runs at exactly the route timeout and 1 ms over. The 429 drill tests retry-after at the 60 s cap and above it. |
| QUAL-03 | adjacency | covered | When two failure causes hit the same job at once, the player sees exactly one in-voice line and gets exactly one refund. The cases are kill switch plus ceiling, and a 429 that arrives after the spend cap was reached. |
| QUAL-03 | empty | covered | A failure response with an empty or missing body, or missing headers (no retry-after, no error type), still maps to a defined failure class. The player sees the in-voice line, never a raw error, and the domain lock is released. |
| QUAL-03 | ordering | covered | When several jobs fail in the same sweep or claim pass, each refunds exactly once and posts its line to its own player, whatever order they are processed in. A test runs the same set in two orders and gets the same end state. |
| QUAL-03 | precision | covered | Refunds and charges are exact integer micro-USD (bigint) with no float rounding. For every drilled job, reserved equals charged plus released exactly, and a full refund equals the reserved amount to the micro-USD. |

No-silent-drop equality: 11 probe items = 11 covered truths.
