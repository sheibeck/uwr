# Phase 39 Spike Record

Throwaway spike: can a scheduled SpacetimeDB procedure call the Anthropic Messages API (`claude-sonnet-5-5`) via `ctx.http.fetch` reliably, without hurting reducers or combat-tick punctuality? Requirements SPIKE-01 to SPIKE-04.

All numbers below are copied from the two verdict reports (`scripts/spike/out/verdict-report.txt` for local, `verdict-report-maincloud.txt` for maincloud; both produced offline by `scripts/spike/verdict.live.ts` from the raw results files) and from `39-11-SUMMARY.md`. Raw samples: `39-spike-results.json` (local) and `39-maincloud-results.json` (maincloud). Both verdicts are reproduced from those raw samples by `spacetimedb/src/helpers/measurement.results.test.ts`.

## Decision

| Item | Value |
|---|---|
| Deciding target | maincloud, database `uwr-spike-925iv` (REVISED 2026-09-29 decision in 39-CONTEXT.md: maincloud decides the gate) |
| Maincloud strict verdict (evaluateGate, noise floor 0) | **go** (cap: none) |
| Maincloud floor-adjusted verdict (noise floor 25 ms) | go (cap: none), the same as strict |
| Executor this selects for Phase 41 | **A scheduled procedure** (`go` maps to a scheduled procedure; `go_with_cap` would have needed a cap) |
| In-flight cap from the gate | None (`GateResult.cap` is null). Independent of the gate, Phase 41's in-flight cap must not exceed the observed maincloud server concurrency cap of 8 (see Implications) |
| Status | **confirmed by the user on 2026-09-29** (reply "confirm-strict"; see Confirmation) |

The local results are provisional context only. The local strict verdict is `incomplete` (level 4 had 147 of the 200 ping samples required), so it is not a decision and was not used for one. Phase 41 still proves the real executor on maincloud.

## Environment

| Item | Local (provisional) | Maincloud (decisive) |
|---|---|---|
| Database | `uwr-spike` on `127.0.0.1:3000` | `uwr-spike-925iv` on `maincloud.spacetimedb.com` |
| SpacetimeDB CLI / runtime / SDK | 2.10.1 / 2.10.1 / npm `spacetimedb` 2.10.1 | CLI and SDK 2.10.1; hosted runtime |
| Node | v22.23.2 | v22.23.2 (harness side) |
| OS | Windows_NT 10.0.19045 (Windows 10 Pro) | harness on the same Windows 10 machine; the database itself is hosted |
| Machine | Low-end, and shared with another LLM build while measuring (user statement) | Hosted; host process access and memory sampling unavailable |
| Server PID | 14384 (left running) | none (hosted) |
| Model | claude-sonnet-5-5 | claude-sonnet-5-5 |
| Build tags | `a` then `b` (the publish-survival test republished a to b) | `b` (the module published to maincloud is build tag `b`; the results file's `environment.buildTags` says `a` only because smoke.live.ts hard-codes it) |
| Started | 2026-09-29T20:18:38Z (results file `environment.startedAt`) | 2026-09-29T23:45:55Z |
| Published by | the orchestrator, through the local-only guard | Claude, through the guard, under the user's 2026-09-29 grant ("I give you permission to publish to uwr-spike db in maincloud"), never with clear or delete flags |

The production database `uwr` was never touched on any server. No delete ran against maincloud.

## Gate (side by side)

Thresholds are 2x the target's own baseline p95 for ping and tick, dispatch p95 < 250 ms, zero failures across all non-drill reliability calls, the region schema compiles, and all minimum sample counts met. Noise floors: maincloud floor-adjusted floor is 25 ms (max of the 25 ms minimum and the measured baseline/baseline2 drift of 0.43 ms). Local floor is 171.77 ms (measured drift between baseline and baseline2 ping p95; the helper applies the floor to the tick thresholds only).

Strict (noise floor 0) results:

| Check | Maincloud threshold | Maincloud strict measured | Maincloud | Maincloud floor-adjusted threshold / measured | Local threshold | Local strict measured | Local |
|---|---|---|---|---|---|---|---|
| samples | all minimums | complete | PASS | complete, PASS | all minimums | ping@4 147/200 | **FAIL** (incomplete) |
| reliability | 0 failures | 0/164 failed | PASS | 0/164, PASS | 0 failures | 0/186 failed | PASS |
| dispatch_p95 (ms) | 250 | 3.003 | PASS | 250 / 3.003, PASS | 250 | 15.851 | PASS |
| region_schema | compiles | compiles | PASS | compiles, PASS | compiles | compiles | PASS |
| ping_p95@8 (ms) | 68.60 | 34.57 | PASS | 68.60 / 34.57, PASS | 427.53 | 591.00 | FAIL |
| tick_p95@8 (ms) | 5.43 | 2.61 | PASS | 27.715 / 2.61, PASS | 26.896 | 14.88 | PASS |
| ping_p95@4 (ms) | 68.60 | 33.47 | PASS | 68.60 / 33.47, PASS | 427.53 | 1274.59 | FAIL |
| tick_p95@4 (ms) | 5.43 | 2.73 | PASS | 27.715 / 2.73, PASS | 26.896 | 26.86 | PASS (razor thin: 2.00x of 13.45) |
| ping_p95@2 (ms) | 68.60 | 35.21 | PASS | 68.60 / 35.21, PASS | 427.53 | 674.41 | FAIL |
| tick_p95@2 (ms) | 5.43 | 2.69 | PASS | 27.715 / 2.69, PASS | 26.896 | 15.23 | PASS |

Local floor-adjusted verdict: also `incomplete` (same sample shortfall; tick thresholds relax to 185.21 ms, ping thresholds do not change, so ping still fails at all three levels).

Baselines: maincloud baseline p95 ping 34.30 ms and tick 2.72 ms (1,300 pings, 66 ticks); baseline2 p95 ping 34.73 ms and tick 2.59 ms (1,300 and 66). Local baseline p95 ping 213.77 ms and tick 13.45 ms (1,091 and 106); baseline2 p95 ping 385.53 ms and tick 15.19 ms (927 and 126).

Ratios to baseline (measured / baseline p95; limit 2.0):

| Level | Maincloud ping | Maincloud tick | Local ping | Local tick |
|---|---|---|---|---|
| 8 in flight | 1.01x | 0.96x | 2.76x | 1.11x |
| 4 in flight | 0.98x | 1.01x | 5.96x | 2.00x |
| 2 in flight | 1.03x | 0.99x | 3.15x | 1.13x |

Filtered gate-window sample counts (pings, ticks): maincloud 1417/71 (level 8), 1406/71 (level 4), 1321/66 (level 2); local 499/140, 147/65, 240/68.

Flags: maincloud strict has no flags; floor-adjusted has `noise_floor_applied`. **There were no reliability failures at all, so no upstream-only failure needed calling out and nothing was excluded or re-run**: every non-drill call succeeded on both targets, with zero platform, upstream or cap-blocked failures and no re-runs (attempt > 1). The only failures in either file are the four deliberate drills per target (2 forced timeouts, 2 bad-key calls), which are excluded from the gate by design and shown in the Reliability section.

## Local provisional verdict

Strict: `incomplete`. The single failed minimum is `ping@4 147/200`. The tick gate passed at every local level, and the ping gate failed at every level (591 / 1275 / 674 ms against a limit of 427.5 ms).

Diagnostics stored in the local results file (`verdict.diagnostics`):
- `DIAGNOSTIC (not a verdict): with minPingSamples lowered to 147: strict=no_go cap=null; floor-adjusted=no_go cap=null`
- `missing minimum: ping@4 147/200 (need all minimum sample counts)`

Why it is not the decision:
- It is incomplete, and `incomplete` is not a decision. The what-if line is a diagnostic and was never treated as a verdict.
- The local ping measurement is dominated by client host load. The machine is low-end and was shared with another LLM build; idle ping p95 drifted 1.80x (213.8 to 385.5 ms) between baseline and baseline2 with no calls in flight at all.
- The user's REVISED decision makes maincloud the deciding target.

## Ping vs tick: what the data supports

What each metric measures:
- **Ping** (`spike_ping` round trip) is the Node harness calling a reducer over the websocket and waiting for the reply. It includes the client host's CPU scheduling, the client's network stack and the server. It is sensitive to client host load.
- **Tick lateness** is the server-side delay between a scheduled reducer's due time and its actual `ctx.timestamp`, sampled at the combat cadence (1 s). It is the direct measure of whether combat ticks stay punctual while procedures are in flight, and does not depend on the client.

Local divergence: ping p95 failed at every level (2.76x, 5.96x, 3.15x) while tick lateness passed at every level (1.11x, 2.00x, 1.13x). The idle control shows the same effect with nothing in flight: baseline2 ping p95 was 1.80x baseline, and baseline2 ping max was 2,631 ms. Idle drift alone consumed most of the 2x allowance.

Maincloud: ping and tick both stayed at baseline at every level, including the full 8 in flight (ping 0.98x to 1.03x, tick 0.96x to 1.01x). Idle drift (baseline2 over baseline) was 1.01x for ping and 0.95x for tick.

What the data supports:
- On maincloud, with up to 8 procedure calls in flight, reducer round trips and combat-cadence tick lateness did not degrade. This is the gate result.
- Locally, tick punctuality held at 2, 4 and 8 in flight (level 4 only just, at 2.00x of a 13.45 ms baseline), and the ping failures coincide with a noisy, shared client host because the idle control drifted by about the same factor.

What the data does not support:
- It does not prove local ping is unaffected by in-flight procedures. The local ping failure is confounded by client host load, so the local data can neither convict nor clear procedures on that metric.
- It does not show behavior beyond the tested range (8 in flight), at other times of day, or under other tenants' load on maincloud; the maincloud leg is one session of roughly six minutes of load windows.
- It does not measure the real `combat_loop` under a live fight; the tick probe at combat cadence is the chosen proxy (39-CONTEXT.md).

## Concurrency cap

| Target | Observed server concurrency cap | Evidence |
|---|---|---|
| Local | **4** | Tick in-flight labels at level 8 peak at 4 (`{"0":1,"2":2,"3":2,"4":138}`); level 8 client end-to-end p50 was 35.13 s against an in-module call p50 of 17.52 s, and 17.2-19.1 s for a single call at level 2 |
| Maincloud | **8** | Tick in-flight labels at level 8: `{"1":1,"4":1,"6":2,"7":6,"8":63}`; the server ran all 8 at once; level 8 client end-to-end p50 17.67 s, level 4 p50 17.66 s, level 2 p50 17.43 s (no queuing) |

What queuing does: when the runtime executes fewer procedures than are enqueued, the excess waits, and end-to-end latency grows by roughly the wait for a free slot. Locally at 8 enqueued with a cap of 4, end-to-end p50 was about 35 s, twice the 17-19 s of an unqueued region call. On maincloud there was no queuing at 8. Effective concurrency used by the gate: local levels 8/4/2 map to 4/4/2, maincloud levels 8/4/2 map to 8/4/2.

Level label histograms (value:count):
- Maincloud level 8: pings (client outstanding) 1:13, 2:8, 3:5, 4:9, 5:15, 6:33, 7:87, 8:1297; ticks (server in-flight) 1:1, 4:1, 6:2, 7:6, 8:63
- Maincloud level 4: pings 1:21, 2:25, 3:315, 4:1091; ticks 1:1, 2:1, 3:16, 4:55
- Maincloud level 2: pings 1:153, 2:1321; ticks 1:8, 2:66
- Local level 8: pings 1:2, 2:13, 3:5, 4:20, 6:9, 8:490; ticks 0:1, 2:2, 3:2, 4:138
- Local level 4: pings 0:1, 2:11, 3:6, 4:141; ticks 0:1, 2:11, 3:8, 4:57
- Local level 2: pings 0:1, 1:25, 2:240; ticks 0:2, 1:4, 2:68

## Reliability

Calls by rung (all attempts; drills separate). Failures by class are shown; there were no re-runs (attempt > 1) anywhere.

| Rung | Local calls / ok | Maincloud calls / ok |
|---|---|---|
| ladder_public_url | 10 / 10 | 10 / 10 |
| ladder_models | 10 / 10 | 10 / 10 |
| ladder_minimal (30-call reliability minimum) | 30 / 30 | 30 / 30 |
| dispatch_noop | 50 / 50 | 50 / 50 |
| dispatch_burst | 8 / 8 | 8 / 8 |
| struct_skill_low / medium | 5 / 5 each | 1 / 1 (low only) |
| struct_region_low / medium | 5 / 5 each | not run |
| thinking_off | 3 / 3 | not run |
| region_compile | 1 / 1 | 1 / 1 |
| cache pair | 2 / 2 | not run |
| direct call (#4954) / publish_survival | 1 / 1 each | not run |
| load level 8 / 4 / 2 | 32 / 32, 16 / 16, 8 / 8 | 32 / 32, 15 / 15, 8 / 8 |
| **Gate reliability total** | 186 calls, 0 failures (30 in `ladder.reliability`) | 164 calls, 0 failures (30 in `ladder.reliability`) |
| drill_timeout | 2 calls, 2 failures, class platform (threw "operation timed out") | 2 calls, 2 failures, class platform |
| drill_bad_key | 2 calls, 2 failures, class auth (HTTP 401 authentication_error, request-id visible) | 2 calls, 2 failures, class auth |

The reliability minimum counts `ladder.reliability` only (30 calls on each target); the gate's zero-failure rule covers all non-drill calls (165 on maincloud counting the exploratory region compile, 192 on local). Failures by class: platform 0, upstream 0, cap-blocked 0.

## Ladder (SPIKE-01)

| Rung | Local e2e p50 / p95 (ms) | Local in-module p50 / p95 (ms) | Maincloud e2e p50 / p95 (ms) | Maincloud in-module p50 / p95 (ms) |
|---|---|---|---|---|
| 1: public URL fetch (10) | 185.6 / 986.2 | 152.3 / 960.5 | 74.5 / 122.6 | 42.1 / 71.0 |
| 2: GET /v1/models (10) | 548.3 / 776.5 | 264.1 / 658.7 | 206.5 / 385.7 | 168.5 / 353.0 |
| 3: minimal Sonnet 5.5 call (30) | 1051.0 / 1482.8 | 787.4 / 1028.1 | 731.4 / 1063.2 | 698.8 / 1032.9 |

All 10 + 10 + 30 calls succeeded on the first attempt on both targets. Ladder diagnostics: none on either target. The local rung 1 p95 (about 986 ms) is a single slow sample among 10. A procedure can reach a public URL and the Anthropic API, so the 2.0.1-style failure does not reproduce on 2.10.1 locally or on maincloud.

## Structured outputs (SPIKE-02)

Local matrix (5 runs per cell, run 0 tagged cold; all 20 ok and all `end_turn`):

| Cell | Client e2e p50 / p95 (ms) | Module call p50 (ms) | Mean output tokens |
|---|---|---|---|
| skill, effort low | 5267 / 12223 (no cold: p50 5192) | 4752 | 578 |
| skill, effort medium | 5277 / 7647 | 5055 | 592 |
| region, effort low | 17356 / 18982 | 17277 | 1858 |
| region, effort medium | 17710 / 21337 | 17519 | 1911 |

- Region schema (hand-written JSON Schema with `additionalProperties: false`) compiles: HTTP 200, `end_turn`, parsed JSON, all required keys present; no staged workaround needed.
- Thinking-off (`thinking: {type: "between_tools"}` with `output_config.format`, skill schema, effort medium): 3 of 3 returned 200, composable = true, client e2e p50 5575 ms, mean output 596 tokens.
- Headers visible on the procedure's response: `request-id` yes; `retry-after` not observed; Anthropic rate-limit and organization/workspace headers were visible locally.
- Timeout drill: `ctx.http.fetch` throws ("operation timed out"); it does not return an error response.

Maincloud sanity pair (SPIKE-02 on the hosted platform): region compile probe `compiles = true`, status 200, `end_turn`, parsed and all required keys present (client e2e 18,568 ms); one skill call at effort low: status 200, `end_turn`, client e2e 5,200 ms, module call 5,169 ms. Bad-key drill on maincloud: 401 authentication_error with request-id visible.

## Dispatch, sender and latency under load (SPIKE-03)

Dispatch latency (first `withTx` minus `scheduledAt`, 50 no-op dispatches, gate metric):

| Target | p50 (ms) | p95 (ms) | max (ms) | ctx cross-check p50 / p95 (ms) | 8-job burst dispatch, information only |
|---|---|---|---|---|---|
| Local | 15.39 | 15.85 | 21.16 | 15.19 / 15.67 | up to 265.6 ms (p50 11.5) |
| Maincloud | 2.20 | 3.00 | 3.15 | 1.92 / 2.80 | up to 291.4 ms (p50 162.5) |

The burst figures are not a gate input, but note that in an 8-job burst later jobs started up to about 0.27-0.29 s after their scheduled time on both targets.

Sender findings (`ctx.sender`):
- In a scheduled procedure it is the **module (database) identity**: local `c200b98fe7f5217266792383321451b81998880e250dc639431aa33c38e449f4`, maincloud `c200d8595d7376690d03566fdd8e9a30038dfac72f1ea53dfa594ad0a4068fd8`; `isModuleIdentity` true, no connection id, not all-zero, usable, and not equal to the client's identity.
- In a client-called (direct) procedure it is the caller identity with a connection id.

Ping and tick p95 by window (ms):

| Window | Local ping (n) | Local tick (n) | Maincloud ping (n) | Maincloud tick (n) |
|---|---|---|---|---|
| baseline | 213.77 (1091) | 13.45 (106) | 34.30 (1300) | 2.72 (66) |
| level 8 | 591.00 (499) | 14.88 (140) | 34.57 (1417) | 2.61 (71) |
| level 4 | 1274.59 (147) | 26.86 (65) | 33.47 (1406) | 2.73 (71) |
| level 2 | 674.41 (240) | 15.23 (68) | 35.21 (1321) | 2.69 (66) |
| baseline2 | 385.53 (927) | 15.19 (126) | 34.73 (1300) | 2.59 (66) |

Load-call end-to-end p50 (ms): local level 8 35,133 / level 4 18,179 / level 2 17,445; maincloud level 8 17,666 / level 4 17,662 / level 2 17,429.

Local memory (working set MB, threads): baseline 292.4 / 32; after level 8 329.4 / 34; after level 4 329.5 / 34; after level 2 329.5 / 36; after baseline2 296.8 / 33; idle after 60 s 296.8 / 34. The memory rise was about 37 MB under load and returned to baseline after. Maincloud memory: unavailable (hosted database, no host process access; `load.memoryNote` in the results file).

## Also captured

- Cache read (local): a back-to-back skill pair reported `cache_read_input_tokens` 3,727 on both calls (input 116, output 562 and 598, cache write 0); `cacheReadObserved` true. The first of the pair already read the cache because earlier skill cells had warmed the same prefix, so this shows the prefix is cacheable, not a cold write.
- #4954 (direct client-called procedure blocking its own connection): local, not observed (`blockedLikely` false; A p50 110.1 ms vs independent connection B p50 105.8 ms while the 21.1 s direct call was pending). Not run on maincloud.
- Publish survival (local): an in-flight call survived a `spacetime publish` of `uwr-spike` (result arrived, original connection saw the row, publish took 16.6 s, no clear requested). Not run on maincloud.
- Composed overhead (RESEARCH Pattern 4; lower bound because it omits Worker CPU, auth and provider time). Formula: current path is echo push + Worker hop + idle ping round trip + echo push; procedure path is the no-op procedure end to end (enqueue to result visible).

| Path | Local p50 / p95 (ms) | Maincloud p50 / p95 (ms) |
|---|---|---|
| Current path (echo + hop + ping + echo) | 139.54 / 354.31 | 119.88 / 158.61 |
| Procedure path (no-op procedure e2e) | 39.38 / 77.17 | 31.16 / 36.54 |

The hop in the maincloud current-path row is the **local wrangler dev hop** (p50 34.27, p95 58.24 ms), because the Worker hop was only measured locally (stubbed provider, 50 samples); the other legs are the maincloud's own (echo push p50 28.67 / p95 33.04 ms; idle ping p50 28.28 / p95 34.30 ms). The comparison shows that dropping the proxy hop and the extra round trips saves roughly 90-100 ms of overhead per call before provider time, which is small against the 5-20 s of the Claude call itself.

## Spend

| Target | Harness estimate (micro-USD) | Module count (micro-USD) | Notes |
|---|---|---|---|
| Local | 1,517,848 (results file) | 2,129,654 | The module count includes about 611,806 micro-USD from 30 accidental region calls (see the incident below) that are not in the local results file |
| Maincloud | 1,147,112 | 1,147,112 | Equal; below the 1,800,000 harness ceiling and the 2,400,000 module cap |
| Combined | | 3,276,766 | About $3.28 of the user's $10 workspace limit |

The key was replaced by a placeholder on both databases before this record (any further paid enqueue fails with a free 401).

## Incident: accidental local paid run

While checking that `load.live.ts` collects, the Plan 39-11 executor ran `vitest run` on that file with `SPIKE_TARGET` unset, which started the local paid load run. It was killed after under two minutes. Effect: 30 extra region calls on the local `uwr-spike` database (calls 1389 to 1419), raising the local module cost from 1,517,848 to 2,129,654 micro-USD (about $0.61). The local results file was not written, so its harness estimate (1,517,848) predates them and is below the module count. The local probe was reset (`spike_reset false`: idle, probe off, nothing in flight). No maincloud impact, and no measured sample was affected. Since then this plan (39-09) ran no live Claude call of any kind; verdict computation is offline.

## Implications for Phases 40, 41 and 43

- **Executor choice (Phase 41):** build the scheduled-procedure executor (maincloud verdict `go`). No backend service with WIF is needed on the strength of this gate. Phase 41 still proves the real executor on maincloud.
- **In-flight cap:** the gate set no cap, but the Phase 41 in-flight cap must not exceed the observed maincloud server concurrency cap of **8**. Locally the runtime executes only **4** at a time, so more than 4 in flight queues in local development and roughly doubles end-to-end latency (about 35 s versus 17-19 s for a region call at 8 enqueued).
- **Player identity on jobs:** `ctx.sender` in a scheduled procedure is the module identity (39-05 local, 39-11 maincloud), so it cannot identify the player. Every job row must carry the requesting player's identity (and character) explicitly, and the result-apply step must authorise against that stored identity, not `ctx.sender`.
- **Latency baselines for Phase 43:** local single-call end-to-end p50 was about 5.3 s for a skill (effort low or medium, about 580-590 output tokens) and about 17.4-17.7 s for a region (about 1.9k output tokens); maincloud skill low was 5.2 s and a maincloud region call was 17.4 to 17.7 s under 2 to 8 in flight. Minimal Sonnet call p50: local 1.05 s, maincloud 0.73 s. Thinking-off did not measurably change latency at effort medium (p50 5.6 s versus 5.3 s). Region latency is dominated by output tokens, which is where Phase 43 speed work belongs.
- **Batch dispatch:** in an 8-job burst later jobs started up to about 0.29 s after they were scheduled; Phase 41 should stagger or accept this. Single no-op dispatch was 3.0 ms p95 on maincloud.
- **Failure handling:** a forced timeout throws rather than returning an error response; a bad key returns HTTP 401 with request-id visible; `retry-after` was not observed. Phase 41 needs a catch around `ctx.http.fetch` and a per-job failure class.
- **Structured outputs:** `output_config.format` works with both the skill schema and a hand-written region JSON Schema; thinking-off (`between_tools`) composes with it. The current `REGION_GENERATION_SCHEMA` example string must be replaced by real JSON Schema in Phase 41.
- **Caches and keys:** the 3.7k-token prefix is cacheable. The key lives in a private table read by the procedure and never in logs.
- **What this spike does not cover:** the real `combat_loop` under a live fight, production-scale tenant load on maincloud, and sustained load beyond 8 in flight.

## Confirmation

- **Outcome:** `confirm-strict` (the user selected "Confirm GO": the maincloud strict verdict `go` is the decision of record)
- **User reply, verbatim:** "confirm-strict"
- **Date:** 2026-09-29 (stored as `verdict.confirmation.at` = 2026-09-30T00:08:42.988Z in `39-maincloud-results.json`)
- **Decision:** Phase 41 builds the scheduled-procedure executor. The Phase 41 in-flight cap is at most 8 (the observed maincloud server concurrency cap). The llm-proxy is retired in Phase 42. Phase 41 still proves the real executor on maincloud.
- The floor-adjusted verdict equals the strict one, so no adjustment was needed; no override was made. The local results remain provisional context and carry no confirmation.

## How the verdicts were computed

Both verdicts come from the unit-tested helpers `evaluateGate(gateInputFromResults(doc))` (strict, noise floor 0) and `evaluateGate(gateInputFromResults(doc, { noiseFloorMs: floorAdjustedNoiseFloorMs(doc) }))`, run offline by `scripts/spike/verdict.live.ts` against each results file (full profile for local, gate profile for maincloud). The local file stores `verdict.role = "provisional"` and the maincloud file stores `verdict.role = "decisive"`. `measurement.results.test.ts` (109 tests) validates both files in final mode and recomputes both strict and floor-adjusted verdicts from the raw samples. The gate's reliability minimum counts `ladder.reliability` only; ping is filtered by client-outstanding count and ticks by server in-flight count at the level's effective concurrency.

## Server logs

Redacted excerpts from the results files' `serverLogs` (only key lengths are ever logged, never key material).

Local (`uwr-spike`):

```
2026-09-29T20:15:00.862234Z  INFO: Invoking `init` reducer
2026-09-29T20:15:00.967502Z  INFO: Database initialized
2026-09-29T20:18:14.296377Z  INFO: spike_whoami spacetimedb_module:32121: spike_whoami sender=c200252497b98fff5aab75f8fbc675956b5a12a5b85042ab355d3a05c6ab7d6e
2026-09-29T20:19:32.458276Z  INFO: spike_set_key spacetimedb_module:32143: spike key set, len=46
2026-09-29T21:55:12.287970Z  INFO: spike_set_key spacetimedb_module:32143: spike key set, len=108
2026-09-29T22:09:00.949381Z  INFO: Updated program to 4a6921b96db234a646b72537e55324a1640dafb29c4efefcddeb621272cfb04e
2026-09-29T22:09:00.950021Z  INFO: Database updated
```

Maincloud (`uwr-spike-925iv`):

```
2026-09-29T23:44:54.084717Z  INFO: Database updated
2026-09-29T23:45:19.830884Z  INFO: spike_whoami spacetimedb_module:32121: spike_whoami sender=c200252497b98fff5aab75f8fbc675956b5a12a5b85042ab355d3a05c6ab7d6e
2026-09-29T23:45:56.546950Z  INFO: spike_whoami spacetimedb_module:32121: spike_whoami sender=c200252497b98fff5aab75f8fbc675956b5a12a5b85042ab355d3a05c6ab7d6e
2026-09-29T23:46:48.235572Z  INFO: spike_set_key spacetimedb_module:32143: spike key set, len=108
```

Both leak scans (local and maincloud, real key as the needle) reported `LEAK-SCAN: CLEAN` before the docs commit.
