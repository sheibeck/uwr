# Phase 43: Edge Coverage from the spec-less probe fallback

Phase 43 has no SPEC, so plan-phase step 7.95 ran the deterministic edge probe (`edge-probe.cjs`) over LAT-01 through LAT-06, COST-03 and OPS-02. It returned 12 applicable items:
- **6 classified edges.** The orchestrator resolved these in auto mode: 6 are covered and none are backstops.
- **6 rows the engine could not classify.** Per the protocol, these stay **unresolved**. The planner must surface each one as an explicit, flagged assumption in a plan and must not drop it silently. A suggested assumption is given for each row below; the planner may refine it from research.

The probe also found no `## Prohibitions` section (PROHIB_ABSENT). So the planner runs prohibition recall in its own prompt and writes each result, without a descriptor, into `must_haves.prohibitions` (see `references/specless-probe-fallback.md` §B/§C).

## Resolved edges (lift into `must_haves.truths`)

| Req | Category | Resolution | Truth to author |
|-----|----------|------------|-----------------|
| LAT-01 | adjacency | covered | When two effort levels tie for a route on the sweep's latency and quality measures, a documented tie-break (the lower effort) picks the value. The measurement record notes the tie. |
| LAT-01 | empty | covered | If a route has no measured samples, or fewer than the documented minimum, it keeps its current effort and `max_tokens`. The measurement record marks the route "insufficient data". A tuned value is written only when it traces to a recorded measurement. |
| LAT-01 | ordering | covered | p99 output size uses a fixed nearest-rank rule over numerically sorted samples, so equal samples give the same answer on every run. The measurement record lists routes and effort levels in a fixed order, so re-runs diff cleanly. |
| COST-03 | adjacency | covered | Unit tests pin the ceiling boundary at ceiling minus 1, the ceiling, and ceiling plus 1 micro-USD. A reservation that brings reserved plus spent to exactly the ceiling is allowed, and one that goes over is refused. If the kill switch and the ceiling both refuse at once, the player sees a single in-voice "Keeper is resting" line, not two. |
| COST-03 | empty | covered | With no spend recorded yet for the current UTC day, global spend counts as 0 and calls proceed. If the kill-switch or ceiling state row is missing, LLM calls fail closed and show the in-voice resting line. This is unit-tested. |
| COST-03 | ordering | covered | When several queued jobs compete for the last headroom under the ceiling, the claim-time check admits them in the executor's existing claim order and refuses the rest. Each refused job refunds its reservation exactly once, and the sweeper never refunds it again. |

## Unclassified rows (surface as flagged assumptions; never drop)

| Req | Status | Suggested assumption for the planner to state (refine from research) |
|-----|--------|-----------------------------------------------------------------------|
| LAT-02 | unresolved | Cache verification makes two identical-prefix calls per route inside the cache TTL during the measured live run. A route whose stable prefix is under the model's minimum cacheable length is recorded as "not cacheable", not counted as failing. |
| LAT-03 | unresolved | If stage 2 of world gen fails or expires, the player keeps the stage-1 region (start location and first NPC). The rest of the region is retried or filled later. The region lock is released either way and the player never gets stuck. |
| LAT-04 | unresolved | If stage 2 of class generation fails, the stage-1 class identity and first ability stay valid and playable. The missing parts are generated later or fall back to static defaults. Character creation never dead-ends. |
| LAT-05 | unresolved | Progress lines come from a server data pool in `spacetimedb/src/data/` that the existing indicator voice and pronoun tests guard. They render in the Phase 42 indicator region with no new component (UI scope decision in 43-CONTEXT.md). |
| LAT-06 | unresolved | The parallel-class decision is made once, from the recorded post-staging class-reveal measurement against the ~10 s threshold. The decision and its number go in the measurement record whichever way it falls. |
| OPS-02 | unresolved | `/llm stats` is admin-only (`requireAdmin`, or an admin-gated view), reads `llm_call_log` only, and prints plain console text. p50 and p95 use the same nearest-rank rule as LAT-01. A route with no calls shows zeros, not an error. |

No-silent-drop equality: 12 items from the probe = 6 resolved edges (6 covered) + 6 flagged assumptions.
